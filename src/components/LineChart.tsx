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

ChartJS.register(LinearScale, PointElement, LineElement, Filler, Tooltip, Decimation)

interface Point {
  date: string
  value: number
}

interface Props {
  data: Point[]
  color: string
  unitLabel: string
}

export function LineChart({ data, color, unitLabel }: Props) {
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
        pointHoverBorderColor: '#fff',
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
          color: '#9ca3af',
          font: { size: 10 },
          callback: (value) => labels[value as number] ?? '',
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#f3f4f6' },
        ticks: { color: '#9ca3af', font: { size: 10 }, precision: 0 },
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
