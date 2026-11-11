import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, LineElement, PointElement, Tooltip, type ChartData, type ChartOptions } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { useTheme } from '../lib/theme'

ChartJS.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip)

interface Props {
  days: { label: string; hours: number }[]
  // Hours / day on their projects; 0 when none is set, and the goal line is left out.
  target: number
}

export function DailyHoursChart({ days, target }: Props) {
  const { mode: theme } = useTheme()
  const dark = theme === 'dark'
  const accent = dark ? '#e0a91f' : '#b3261e'
  const tickColor = dark ? '#8f8c83' : '#7d766a'
  const gridColor = dark ? '#36352f' : '#e4dccc'
  const round = (n: number) => Number(n.toFixed(1))

  const data: ChartData<'bar' | 'line'> = {
    labels: days.map((d) => d.label),
    datasets: [
      {
        type: 'bar',
        label: 'Rendered',
        data: days.map((d) => round(d.hours)),
        backgroundColor: accent,
        borderRadius: 2,
        maxBarThickness: 28,
      },
      ...(target > 0
        ? [
            {
              type: 'line' as const,
              label: 'Goal',
              data: days.map(() => target),
              borderColor: tickColor,
              borderDash: [4, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              pointHoverRadius: 0,
            },
          ]
        : []),
    ],
  }

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.formattedValue}h` } },
    },
    scales: {
      x: { ticks: { color: tickColor, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
      y: {
        beginAtZero: true,
        suggestedMax: target > 0 ? target + 1 : undefined,
        ticks: { color: tickColor, callback: (value) => `${value}h` },
        grid: { color: gridColor },
      },
    },
  }

  return (
    <div className="h-56">
      <Chart type="bar" data={data} options={options} />
    </div>
  )
}
