import { ref } from 'vue'
import { ElMessage } from 'element-plus'

import { createPrintTask, fetchReceipt, reportPrintTask } from '@/api/print'
import type { PrintTaskItem, PrintTicketType } from '@/api/types/print'
import { printReceipt, previewReceipt } from './printer'

export interface PrintOrderOptions {
  orderId: number
  ticketType?: PrintTicketType
  copies?: number
  /** auto 由出餐流转触发，manual 由按钮触发；仅用于流水留痕 */
  trigger?: 'auto' | 'manual'
  /** 静默模式：自动打印时不弹成功提示，避免每单都弹一次 */
  silent?: boolean
}

/**
 * 打印一张订单小票的完整流程：建任务 →（browser）出纸 + 回执 /（cloud）看后端结果。
 *
 * 抽成 composable 而不是写在组件里，是因为订单列表、详情抽屉、
 * 出餐自动打印三处都要走同一套流程；三处各写一遍迟早出现
 * 「某个入口忘了回执」导致流水里全是 pending 的情况。
 *
 * 两种打印方式在这里分流，但**分流依据只有一个**：任务落库时的 `mode`。
 * 这个字段由后端按实际选中的打印机写入，所以前端不可能「以为在打云打印机
 * 其实在打浏览器」—— 出纸方式跟着任务走，不跟着页面状态走。
 */
export function useReceiptPrint() {
  const printing = ref(false)

  async function printOrderReceipt(options: PrintOrderOptions): Promise<boolean> {
    const { orderId, ticketType = 'customer', copies, trigger = 'manual', silent = false } = options

    if (printing.value) {
      ElMessage.warning('上一张小票还在打印中，请稍候')
      return false
    }

    printing.value = true
    try {
      // 先建任务再出纸：这样即使出纸中途崩溃，流水里也留着一条 pending，
      // 能看出「这一单本来是要打的」，比事后完全查不到强
      const task = await createPrintTask({ orderId, ticketType, copies, trigger })

      if (task.mode === 'cloud') {
        return handleCloudResult(task, silent)
      }

      const receipt = await fetchReceipt(orderId, ticketType)
      const result = await printReceipt(receipt)

      await reportPrintTask(task.id, {
        status: result.success ? 'success' : 'failed',
        failReason: result.success ? undefined : result.reason,
      })

      if (result.success) {
        if (!silent) ElMessage.success('小票已发送到打印机')
      } else {
        ElMessage.error(result.reason || '打印失败')
      }
      return result.success
    } catch (error) {
      // 接口层的错误已经由 request 拦截器弹过提示，这里不再重复弹
      if (!silent) ElMessage.error('打印未完成')
      return false
    } finally {
      printing.value = false
    }
  }

  /**
   * 云打印机的结果由后端在推单时就已经写好了，前端**不再调 window.print()**，
   * 也不回执 —— 回执是 browser 模式的概念，云模式再回一次会把后端
   * 刚写的成功结果覆盖掉。这里只负责把结论告诉操作人。
   */
  function handleCloudResult(task: PrintTaskItem, silent: boolean): boolean {
    if (task.status === 'success') {
      if (!silent) {
        ElMessage.success(`小票已推送到「${task.printerName ?? '云打印机'}」，稍候出纸`)
      }
      return true
    }
    if (task.status === 'pending') {
      // 网关排队中：任务还没收口，让商家去打印流水里看最终结果
      if (!silent) ElMessage.info('小票已提交到云打印机，出纸结果请稍后在打印流水查看')
      return true
    }
    ElMessage.error(task.failReason || '云打印机推送失败，可在打印流水里重试')
    return false
  }

  /** 仅预览版面，不建任务不出纸。 */
  async function previewOrderReceipt(
    orderId: number,
    ticketType: PrintTicketType = 'customer',
  ): Promise<void> {
    if (printing.value) {
      ElMessage.warning('上一张小票还在打印中，请稍候')
      return
    }
    printing.value = true
    try {
      const receipt = await fetchReceipt(orderId, ticketType)
      if (!previewReceipt(receipt)) {
        ElMessage.error('预览窗口被浏览器拦截，请允许本站弹出窗口后重试')
      }
    } catch {
      ElMessage.error('小票数据加载失败')
    } finally {
      printing.value = false
    }
  }

  return { printing, printOrderReceipt, previewOrderReceipt }
}
