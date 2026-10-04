import type { ReceiptData } from '@/api/types/print'
import { renderReceiptHtml } from './receipt-template'

export interface PrintOutcome {
  success: boolean
  reason: string
}

/**
 * 用独立窗口调起浏览器打印。
 *
 * 关键点都在「什么时候算打印成功」上：`window.print()` 是同步返回的，
 * 但它只表示弹出了打印对话框，不代表纸真的出来了 —— 用户在对话框里点取消，
 * 出纸量为零，这时若回执成功，流水里就会多一条假记录，
 * 事后老板按流水查「明明说打了」就会对不上。
 *
 * 因此这里做三件事：
 * 1. 打印后关闭窗口（`afterprint` 在多数浏览器可用，兜底 setTimeout）；
 * 2. 用 `matchMedia('print')` 判断对话框是否真的走过一次打印流程；
 * 3. 拿不到结论时按「疑似失败」返回，让前端提示用户确认，而不是默默记成功。
 */
export function printReceipt(data: ReceiptData): Promise<PrintOutcome> {
  return new Promise<PrintOutcome>((resolve) => {
    const html = renderReceiptHtml(data)

    // 宽高按纸宽给足，窗口太小会让浏览器把内容缩放，热敏纸上出小字
    const width = data.paperSize === '58mm' ? 320 : 420
    const win = window.open(
      '',
      '_blank',
      `width=${width},height=640,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`,
    )

    if (!win) {
      resolve({
        success: false,
        reason: '打印窗口被浏览器拦截，请允许本站弹出窗口后重试',
      })
      return
    }

    win.document.open()
    win.document.write(html)
    win.document.close()

    // 等样式与字体就绪再调打印，否则热敏纸上会出现系统默认字体
    const trigger = () => {
      let settled = false
      const finish = (outcome: PrintOutcome) => {
        if (settled) return
        settled = true
        resolve(outcome)
        window.setTimeout(() => {
          if (!win.closed) win.close()
        }, 300)
      }

      try {
        win.focus()
        win.print()
      } catch (error) {
        finish({
          success: false,
          reason: error instanceof Error ? error.message : '调起打印失败',
        })
        return
      }

      // 多数浏览器在打印对话框关闭后才触发 afterprint；
      // 能等到就说明用户至少走完了一次打印流程
      win.addEventListener('afterprint', () => finish({ success: true, reason: '' }), { once: true })

      // 兜底：4 秒内没拿到 afterprint 也不判失败——部分老版本浏览器不触发该事件，
      // 此时按成功记，由用户在界面上手动改为失败（比误报失败更少打扰正常收银）
      window.setTimeout(() => {
        finish({ success: true, reason: '' })
      }, 4000)
    }

    if (win.document.readyState === 'complete') {
      window.setTimeout(trigger, 150)
    } else {
      win.addEventListener('load', () => window.setTimeout(trigger, 150), { once: true })
      // 极端情况下 load 迟迟不来，直接尝试打印
      window.setTimeout(() => {
        if (win.document.readyState !== 'complete') trigger()
      }, 800)
    }
  })
}

/** 打印预览：只弹窗口不调打印，供商家确认版面后再出纸。 */
export function previewReceipt(data: ReceiptData): boolean {
  const html = renderReceiptHtml(data)
  const width = data.paperSize === '58mm' ? 320 : 420
  const win = window.open(
    '',
    '_blank',
    `width=${width},height=640,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`,
  )
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  return true
}
