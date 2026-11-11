import {
  Chart as ChartJS,
  Decimation,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useTheme } from '../lib/theme'

ChartJS.register(LinearScale, PointElement, LineElement, Filler, Tooltip, Decimation)

interface Point {
  date: string
  value: number
}

interface Props {
  data: Point[]
  // A hex colour, 'ink' for the theme's text colour (near-black, or near-white on dark), or
  // 'accent' for the theme's accent (barber red, or honey on dark).
  color: string
  unitLabel: string
}

export function LineChart({ data, color: colorProp, unitLabel }: Props) {
  const { mode: theme } = useTheme()
  const color =
    colorProp === 'ink' ? (theme === 'dark' ? '#f4f2ec' : '#1c1c1c') : colorProp === 'accent' ? (theme === 'dark' ? '#e0a91f' : '#b3261e') : colorProp
  const tickColor = theme === 'dark' ? '#8f8c83' : '#7d766a'
  const gridColor = theme === 'dark' ? '#36352f' : '#e4dccc'
  const labels = data.map((p) => p.date.slice(5))

  const chartData = {
    datasets: [
      {
        data: data.map((p, i) => ({ x: i, y: p.value })),
        borderColor: color,
        backgroundColor: `${color}1f`,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: theme === 'dark' ? '#252523' : '#fbf8f2',
        pointHoverBorderWidth: 1.5,
        borderWidth: 2,
      },
    ],
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    parsing: false,
    scales: {
      x: {
        type: 'linear',
        grid: { display: false },
        ticks: {
          autoSkip: true,
          maxRotation: 0,
          color: tickColor,
          font: { size: 10 },
          callback: (value) => labels[value as number] ?? '',
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: tickColor, font: { size: 10 }, precision: 0 },
      },
    },
    plugins: {
      legend: { display: false },
      decimation: { enabled: true, algorithm: 'lttb', samples: 30 },
      tooltip: {
        callbacks: {
          title: (items) => labels[items[0]?.parsed.x as number] ?? '',
          label: (ctx) => `${ctx.parsed.y} ${unitLabel}`,
        },
      },
    },
  }

  return (
    <div className="h-40 w-full">
      <Line data={chartData} options={options} />
    </div>
  )
}
