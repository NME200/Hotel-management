import { PrintTicketType } from '../../../common/constants/dict';
import { formatCents } from '../../../common/utils/money.util';
import type { ReceiptData, ReceiptLine } from '../../merchant/print/dto/print.dto';

/**
 * 把 `ReceiptData` 渲染成云打印机认识的一段文本。
 *
 * 两家厂商的指令集有交集，这里只用交集里的标记：
 * - `<CB></CB>` 放大加粗（标题）
 * - `<C></C>` 居中
 * - `<B></B>` 加粗
 * - `<BR>` 换行
 * 这些在飞鹅与易联云都是同一语义，所以一份文本能同时喂给两边。
 *
 * 三条必须守住的口径：
 * 1. **金额单位是「分」**，这里用 `formatCents` 换元显示，绝不自己除 100；
 * 2. **后厨小票不含任何金额**，靠的是 `receipt.showAmount` 由后端决定，
 *    而不是"记得别渲染"；
 * 3. 菜名与备注里的 `<` / `>` / `&` 必须转义 —— 否则顾客在备注里写
 *    `<BR>` 就是一个真实的换行注入，能把票面结构搞乱。
 */

const PAPER_COLUMNS: Record<string, number> = {
  '58mm': 32,
  '80mm': 48,
};

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 按显示宽度折行：中文占 2 列，西文占 1 列，避免长菜名把票面撑开。 */
function wrap(value: string, columns: number): string[] {
  const lines: string[] = [];
  let current = '';
  let width = 0;

  for (const char of value) {
    const charWidth = char.charCodeAt(0) > 0x2e7f ? 2 : 1;
    if (width + charWidth > columns && current.length > 0) {
      lines.push(current);
      current = '';
      width = 0;
    }
    current += char;
    width += charWidth;
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += char.charCodeAt(0) > 0x2e7f ? 2 : 1;
  }
  return width;
}

/** 左侧菜名、右侧金额撑满一行；菜名过长时先折行，金额落最后一行右侧。 */
function padRow(left: string, right: string, columns: number): string {
  const rightWidth = displayWidth(right);
  const leftLines = wrap(left, Math.max(columns - rightWidth - 1, 8));
  const head = leftLines.slice(0, -1);
  const last = leftLines[leftLines.length - 1] ?? '';
  const gap = Math.max(columns - displayWidth(last) - rightWidth, 1);
  return [...head, `${last}${' '.repeat(gap)}${right}`].join('<BR>');
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  const pad = (value: number): string => `${value}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderLine(line: ReceiptLine, columns: number, showAmount: boolean): string {
  const name = escapeText(line.dishName);
  const spec = line.specDesc ? ` ${escapeText(line.specDesc)}` : '';
  const head = `${name}${spec}`;
  const quantity = `x${line.quantity}`;

  if (!showAmount) {
    // 后厨票只需要"做什么、多少份、备注"，金额、单价一律不出现
    const parts = [wrap(`${head} ${quantity}`, columns).join('<BR>')];
    if (line.remark) {
      parts.push(`  备注：${wrap(escapeText(line.remark), columns - 6).join('<BR>')}`);
    }
    return parts.join('<BR>');
  }

  const suffix = line.quantity > 1 ? ` x${line.quantity}` : '';
  return padRow(`${head}${suffix}`, formatCents(line.totalCents), columns);
}

function renderShopHeader(receipt: ReceiptData, columns: number): string {
  const rows = [`<CB>${escapeText(receipt.shop.name)}</CB>`];
  if (receipt.shop.address) {
    rows.push(wrap(receipt.shop.address, columns).join('<BR>'));
  }
  if (receipt.shop.phone) {
    rows.push(`电话：${escapeText(receipt.shop.phone)}`);
  }
  return `<C>${rows.join('<BR>')}</C>`;
}

/**
 * 渲染一张小票。
 * `columns` 按纸宽推导，58mm 是 32 列、80mm 是 48 列 —— 与热敏机实际列数一致，
 * 猜错会导致票面右侧金额错位。
 */
export function renderReceiptText(receipt: ReceiptData): string {
  const columns = PAPER_COLUMNS[receipt.paperSize] ?? PAPER_COLUMNS['80mm']!;
  const divider = '-'.repeat(columns);
  const blocks: string[] = [];

  blocks.push(renderShopHeader(receipt, columns));
  blocks.push(divider);

  const title = receipt.ticketType === PrintTicketType.Kitchen ? '后厨制作单' : '消费小票';
  blocks.push(`<C><B>${title}</B></C>`);
  blocks.push(divider);

  blocks.push(`订单号：${escapeText(receipt.orderNo)}`);
  if (receipt.pickupCode) {
    blocks.push(`<B>取餐码：${escapeText(receipt.pickupCode)}</B>`);
  }
  blocks.push(`就餐方式：${escapeText(receipt.dineTypeLabel)}`);
  if (receipt.tableNo) {
    blocks.push(`桌号：${escapeText(receipt.tableNo)}`);
  }
  if (receipt.peopleCount > 0) {
    blocks.push(`人数：${receipt.peopleCount}`);
  }
  if (receipt.memberNickname) {
    blocks.push(`会员：${escapeText(receipt.memberNickname)}`);
  }
  blocks.push(`下单时间：${formatTime(receipt.orderedAt)}`);
  blocks.push(divider);

  const itemHeader = receipt.showAmount
    ? padRow('菜品', '金额', columns)
    : '菜品';
  blocks.push(itemHeader);

  for (const line of receipt.lines) {
    blocks.push(renderLine(line, columns, receipt.showAmount));
  }

  blocks.push(divider);
  blocks.push(`合计 ${receipt.itemCount} 件`);

  if (receipt.showAmount) {
    const amount = receipt.amount;
    blocks.push(padRow('菜品金额', formatCents(amount.dishCents), columns));
    if (amount.packingCents > 0) {
      blocks.push(padRow('打包费', formatCents(amount.packingCents), columns));
    }
    if (amount.deliveryCents > 0) {
      blocks.push(padRow('配送费', formatCents(amount.deliveryCents), columns));
    }
    if (amount.discountCents > 0) {
      blocks.push(padRow('优惠', `-${formatCents(amount.discountCents)}`, columns));
    }
    blocks.push(divider);
    // 实付要放大：这是顾客唯一会核对的数字
    blocks.push(`<B>${padRow('实付', formatCents(amount.payCents), columns)}</B>`);
  }

  if (receipt.remark) {
    blocks.push(divider);
    blocks.push(`备注：${wrap(escapeText(receipt.remark), columns - 6).join('<BR>')}`);
  }

  blocks.push(divider);
  blocks.push(`<C>${escapeText(receipt.footer)}</C>`);
  blocks.push(`<C>打印时间：${formatTime(receipt.printedAt)}</C>`);

  return blocks.join('<BR>');
}
