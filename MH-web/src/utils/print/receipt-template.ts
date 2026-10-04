import type { ReceiptData } from '@/api/types/print'
import { formatMoney } from '@/utils/format'

/** 金额「分」转元展示。小票上的钱与页面同一口径，只在这里换一次。 */
function yuan(cents: number): string {
  return formatMoney(cents / 100)
}

/** 小票等宽排版靠空格补齐，这里统一裁到固定宽度避免长菜名把版面撑破。 */
function fit(text: string, width: number): string {
  const chars = [...text]
  if (chars.length <= width) return text
  return `${chars.slice(0, width - 1).join('')}…`
}

/**
 * 生成一张小票的 HTML。
 *
 * 为什么用 HTML 而不是 canvas 或截图：
 * 热敏小票机在系统里就是一台普通打印机，浏览器打印是最通用的出纸方式 ——
 * 不需要装驱动插件、不需要本地服务，收银机换一台也能用。
 *
 * 版面按 58/80mm 两种纸宽分别定宽，用一个独立的打印窗口渲染，
 * 由 `utils/print/printer.ts` 调起 `window.print()`。
 * 所有金额都由后端算好，这里只做字符串拼接。
 */
export function renderReceiptHtml(data: ReceiptData): string {
  const width = data.paperSize === '58mm' ? '58mm' : '80mm'
  const fontSize = data.paperSize === '58mm' ? '11px' : '12px'
  const nameWidth = data.paperSize === '58mm' ? 16 : 22
  const remarkWidth = data.paperSize === '58mm' ? 20 : 28

  const amountRows = data.showAmount
    ? `
      ${amountRow('菜品金额', yuan(data.amount.dishCents))}
      ${data.amount.packingCents > 0 ? amountRow('打包费', yuan(data.amount.packingCents)) : ''}
      ${data.amount.deliveryCents > 0 ? amountRow('配送费', yuan(data.amount.deliveryCents)) : ''}
      ${data.amount.discountCents > 0 ? amountRow('优惠金额', `-${yuan(data.amount.discountCents)}`) : ''}
      <div class="sum"><span>实付金额</span><span>${yuan(data.amount.payCents)}</span></div>
    `
    : ''

  const itemRows = data.lines
    .map((line) => {
      const spec = line.specDesc ? `<div class="spec">${escapeHtml(line.specDesc)}</div>` : ''
      const remark = line.remark
        ? `<div class="remark">备注：${escapeHtml(fit(line.remark, remarkWidth))}</div>`
        : ''
      const price = data.showAmount
        ? `<div class="line-money"><span>${yuan(line.unitPriceCents)} × ${line.quantity}</span><span>${yuan(line.totalCents)}</span></div>`
        : `<div class="line-money"><span>× ${line.quantity}</span></div>`
      return `
        <div class="item">
          <div class="item-name">${escapeHtml(fit(line.dishName, nameWidth))}</div>
          ${spec}
          ${remark}
          ${price}
        </div>
      `
    })
    .join('')

  const tableLine =
    data.dineTypeLabel === '堂食'
      ? `<div class="meta-row"><span>桌号</span><span>${escapeHtml(data.tableNo || '--')}　${data.peopleCount} 人</span></div>`
      : ''

  const memberLine = data.memberNickname
    ? `<div class="meta-row"><span>会员</span><span>${escapeHtml(data.memberNickname)}</span></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.orderNo)}</title>
<style>
  @page { size: ${width} auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: ${width};
    padding: 4mm 2mm;
    font-family: "Microsoft YaHei", "PingFang SC", SimHei, sans-serif;
    font-size: ${fontSize};
    line-height: 1.45;
    color: #000;
  }
  .center { text-align: center; }
  .shop-name { font-size: ${data.paperSize === '58mm' ? '14px' : '16px'}; font-weight: 700; letter-spacing: 1px; }
  .shop-meta { margin-top: 2px; }
  .title { margin: 6px 0 4px; font-size: ${data.paperSize === '58mm' ? '12px' : '13px'}; font-weight: 700; letter-spacing: 2px; }
  .divider { border-top: 1px dashed #000; margin: 5px 0; }
  .pickup { font-size: ${data.paperSize === '58mm' ? '15px' : '18px'}; font-weight: 700; letter-spacing: 2px; }
  .meta-row { display: flex; justify-content: space-between; gap: 6px; }
  .item { margin-bottom: 4px; }
  .item-name { font-weight: 600; word-break: break-all; }
  .spec, .remark { padding-left: 6px; word-break: break-all; }
  .line-money { display: flex; justify-content: space-between; padding-left: 6px; }
  .amounts { margin-top: 2px; }
  .amount-row { display: flex; justify-content: space-between; }
  .sum { display: flex; justify-content: space-between; font-weight: 700; font-size: ${data.paperSize === '58mm' ? '13px' : '14px'}; margin-top: 3px; }
  .footer { margin-top: 6px; text-align: center; }
  .barcode { margin-top: 4px; letter-spacing: 2px; font-family: Consolas, monospace; }
</style>
</head>
<body>
  <div class="center shop-name">${escapeHtml(data.shop.name)}</div>
  ${data.shop.phone ? `<div class="center shop-meta">电话：${escapeHtml(data.shop.phone)}</div>` : ''}
  ${data.shop.address ? `<div class="center shop-meta">${escapeHtml(data.shop.address)}</div>` : ''}

  <div class="divider"></div>
  <div class="center title">${data.ticketType === 'kitchen' ? '后厨制作单' : '消费小票'}</div>

  ${
    data.pickupCode && data.ticketType === 'customer'
      ? `<div class="center pickup">取餐号 ${escapeHtml(data.pickupCode)}</div>`
      : ''
  }

  <div class="divider"></div>
  <div class="meta-row"><span>单号</span><span>${escapeHtml(data.orderNo)}</span></div>
  <div class="meta-row"><span>就餐方式</span><span>${escapeHtml(data.dineTypeLabel)}</span></div>
  ${tableLine}
  ${memberLine}
  <div class="meta-row"><span>下单时间</span><span>${escapeHtml(data.orderedAt)}</span></div>
  ${data.remark ? `<div class="meta-row"><span>整单备注</span><span>${escapeHtml(fit(data.remark, remarkWidth))}</span></div>` : ''}

  <div class="divider"></div>
  ${itemRows || '<div class="center">无菜品明细</div>'}
  <div class="divider"></div>

  ${
    data.showAmount
      ? `<div class="amounts">${amountRows}</div><div class="divider"></div>`
      : ''
  }

  <div class="meta-row"><span>菜品件数</span><span>${data.itemCount} 件</span></div>
  <div class="meta-row"><span>打印时间</span><span>${escapeHtml(data.printedAt)}</span></div>
  <div class="meta-row"><span>打印份数</span><span>${data.copies} 份</span></div>

  <div class="divider"></div>
  <div class="footer">${escapeHtml(data.footer)}</div>
  <div class="center barcode">${escapeHtml(data.orderNo)}</div>
</body>
</html>`
}

function amountRow(label: string, value: string): string {
  return `<div class="amount-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
}

/** 菜名与备注来自顾客输入，必须转义，否则小票会被当成 HTML 渲染。 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
