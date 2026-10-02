import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useTheme } from '../lib/theme'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

// One line per team across the same weeks, for comparing them on one measure (Team Reports).
// Colours repeat after ten teams; the legend and tooltip still name each line.
const PALETTE = ['#d4a017', '#0284c7', '#16a34a', '#db2777', '#7c3aed', '#ea580c', '#0d9488', '#dc2626', '#4f46e5', '#65a30d']

export interface TeamSeries {
  label: string
  values: number[]
}

export function TeamTrendChart({ labels, series, unitLabel }: { labels: string[]; series: TeamSeries[]; unitLabel: string }) {
  const { theme } = useTheme()
  const tickColor = theme === 'dark' ? '#7a8190' : '#9ca3af'
  const gridColor = theme === 'dark' ? '#2b2f39' : '#f3f4f6'

  const data = {
    labels,
    datasets: series.map((team, index) => ({
      label: team.label,
      data: team.values,
      borderColor: PALETTE[index % PALETTE.length],
      backgroundColor: PALETTE[index % PALETTE.length],
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.25,
    })),
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: tickColor, boxWidth: 12, usePointStyle: true } },
      tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.formattedValue} ${unitLabel}` } },
    },
    scales: {
      x: { ticks: { color: tickColor }, grid: { color: gridColor } },
      y: { beginAtZero: true, ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor } },
    },
  }

  return (
    <div className="h-72">
      <Line data={data} options={options} />
    </div>
  )
}
