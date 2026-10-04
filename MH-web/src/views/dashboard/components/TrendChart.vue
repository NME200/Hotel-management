<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import { formatAmount, shortDate } from '@/utils/format'

use([CanvasRenderer, BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent])

/** 与后端 orderTrend 同形：固定 7 项且末项为今日 */
interface TrendPoint {
  date: string
  orderCount: number
  turnover: number
}

const props = withDefaults(defineProps<{ points: TrendPoint[]; height?: string }>(), {
  height: '290px',
})

const ORDER_COLOR = '#4f7cff'
const TURNOVER_COLOR = '#2fa66a'

/** 轴上的大数收成 1.2万 / 3.4k，比 12000 好读 */
function compact(value: number): string {
  if (value >= 10000) return `${trimZero(value / 10000)}万`
  if (value >= 1000) return `${trimZero(value / 1000)}k`
  return String(Math.round(value))
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/** 末项是今日：轴上直接写「今日」，运营不用再去数第几根柱子 */
const axisLabels = computed(() =>
  props.points.map((point, index) =>
    index === props.points.length - 1 ? '今日' : shortDate(point.date),
  ),
)

const option = computed(() => ({
  // ECharts 6 里 containLabel 已废弃；这两行是官方给的等价写法（轴标签算进网格边界）
  grid: { top: 34, right: 6, bottom: 2, left: 6, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
  legend: {
    right: 0,
    top: 0,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 18,
    icon: 'roundRect',
    textStyle: { color: '#606266', fontSize: 12 },
    data: ['订单量', '营业额'],
  },
  tooltip: {
    trigger: 'axis',
    extraCssText: 'border-radius:10px;border:1px solid #eef1f6;box-shadow:0 6px 20px rgb(15 23 42 / 10%);',
    axisPointer: { type: 'line', lineStyle: { color: '#c8ccd4', width: 1, type: 'dashed' } },
    formatter: (params: unknown) => {
      const items = (Array.isArray(params) ? params : [params]) as {
        dataIndex: number
        seriesName: string
        value: number
      }[]
      if (items.length === 0) return ''
      const point = props.points[items[0].dataIndex]
      if (!point) return ''
      const title = `<div style="color:#909399;font-size:12px;margin-bottom:6px">${shortDate(point.date)}${
        items[0].dataIndex === props.points.length - 1 ? ' · 今日' : ''
      }</div>`
      const rows = items
        .map((item) => {
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${
            item.seriesName === '订单量' ? ORDER_COLOR : TURNOVER_COLOR
          }"></span>`
          const text =
            item.seriesName === '订单量'
              ? `${item.value} 单`
              : `¥${formatAmount(item.value)}`
          return `<div style="display:flex;justify-content:space-between;gap:20px;line-height:22px">
            <span>${dot}${item.seriesName}</span><span style="font-weight:600">${text}</span></div>`
        })
        .join('')
      return `${title}${rows}`
    },
  },
  xAxis: {
    type: 'category',
    data: axisLabels.value,
    boundaryGap: true,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#e6e9f0' } },
    axisLabel: {
      color: '#909399',
      fontSize: 12,
      margin: 12,
      formatter: (label: string, index: number) =>
        index === props.points.length - 1 ? '{a|今日}' : label,
      rich: { a: { color: ORDER_COLOR, fontWeight: 600, fontSize: 12 } },
    },
  },
  yAxis: [
    {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: '#909399', fontSize: 11, formatter: (value: number) => compact(value) },
      splitLine: { lineStyle: { color: '#eef1f6', type: 'dashed' } },
    },
    {
      type: 'value',
      axisLabel: { color: '#909399', fontSize: 11, formatter: (value: number) => compact(value) },
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: '订单量',
      type: 'bar',
      yAxisIndex: 0,
      barMaxWidth: 26,
      barGap: '-52%',
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: '#8aa6ff' },
            { offset: 1, color: 'rgba(79, 124, 255, 0.28)' },
          ],
        },
      },
      emphasis: { focus: 'series', itemStyle: { color: ORDER_COLOR } },
      data: props.points.map((point) => point.orderCount),
    },
    {
      name: '营业额',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      showSymbol: false,
      lineStyle: { width: 3, color: TURNOVER_COLOR },
      itemStyle: { color: TURNOVER_COLOR, borderColor: '#fff', borderWidth: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(47, 166, 106, 0.20)' },
            { offset: 1, color: 'rgba(47, 166, 106, 0)' },
          ],
        },
      },
      z: 3,
      data: props.points.map((point) => point.turnover),
    },
  ],
}))
</script>

<template>
  <div class="trend" :style="{ height }">
    <el-empty v-if="points.length === 0" description="暂无趋势数据" :image-size="72" />
    <VChart v-else :option="option" autoresize class="trend__chart" />
  </div>
</template>

<style scoped>
.trend {
  position: relative;
  width: 100%;
}

.trend__chart {
  width: 100%;
  height: 100%;
}
</style>
