import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { downloadCsv } from '../lib/csv'
import { TEAM_METRICS, fetchTeamReports, type TeamMetric } from '../lib/teamReports'
import { TeamTrendChart } from '../components/TeamTrendChart'

// Team Reports: each lead's team compared week by week. An admin sees every team; a lead sees
// their own, so they can compare it against its own earlier weeks.

const WEEK_OPTIONS = [4, 8, 12]

function shortWeek(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function TeamReports() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [weekCount, setWeekCount] = useState(8)
  const [metric, setMetric] = useState<TeamMetric>('submitted')

  const { data, isLoading, error } = useQuery({
    queryKey: ['team-reports', weekCount, isAdmin ? null : user?.id],
    queryFn: () => fetchTeamReports(weekCount, isAdmin ? null : (user?.id ?? null)),
    enabled: Boolean(user),
    staleTime: 60_000,
  })

  const metricInfo = TEAM_METRICS.find((m) => m.metric === metric)!
  const labels = (data?.weekStarts ?? []).map(shortWeek)
  const teams = data?.teams ?? []

  function exportCsv() {
    downloadCsv(
      `team-reports-${data?.weekStarts[0]}-${weekCount}-weeks.csv`,
      teams.flatMap((team) =>
        team.weeks.map((week) => ({
          team: team.leadName,
          week_start: week.weekStart,
          tasks_submitted: week.submitted,
          active_contributors: week.active,
          bad_video_reports: week.bad_videos,
        })),
      ),
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Reports</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'Every team' : 'Your team'}, week by week (Tuesday to Monday). The current week is still in progress.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data || teams.length === 0}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Measure" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {TEAM_METRICS.map((m) => (
            <button
              key={m.metric}
              role="tab"
              aria-selected={metric === m.metric}
              title={m.description}
              onClick={() => setMetric(m.metric)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                metric === m.metric ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Weeks
          <select
            value={weekCount}
            onChange={(e) => setWeekCount(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
          >
            {WEEK_OPTIONS.map((n) => (
              <option key={n} value={n}>
                Last {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text">
          {(error as Error).message || 'Could not load the team reports.'}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : teams.length === 0 ? (
        <p className="text-sm text-gray-500">No teams to show yet.</p>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <p className="mb-1 text-sm font-semibold text-gray-700">{metricInfo.label}</p>
            <p className="mb-4 text-xs text-gray-400">{metricInfo.description}</p>
            <TeamTrendChart
              labels={labels}
              series={teams.map((team) => ({ label: team.leadName, values: team.weeks.map((week) => week[metric]) }))}
              unitLabel={metricInfo.label.toLowerCase()}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Team</th>
                  {labels.map((label, i) => (
                    <th key={data!.weekStarts[i]} className="px-3 py-3 text-right font-semibold whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {teams.map((team) => {
                  const values = team.weeks.map((week) => week[metric])
                  // Last full week against the one before, so the half-done current week doesn't read as a drop.
                  const lastFull = values[values.length - 2] ?? 0
                  const previous = values[values.length - 3] ?? 0
                  const change = lastFull - previous
                  // Fewer bad-video reports is the good direction.
                  const better = metric === 'bad_videos' ? change < 0 : change > 0
                  return (
                    <tr key={team.leadId ?? 'none'}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{team.leadName}</div>
                        <div className="text-xs text-gray-400">
                          {team.contributors} contributor{team.contributors === 1 ? '' : 's'}
                        </div>
                      </td>
                      {values.map((value, i) => (
                        <td key={team.weeks[i].weekStart} className="px-3 py-3 text-right tabular-nums text-gray-700">
                          {value}
                        </td>
                      ))}
                      <td
                        title="Last full week compared with the week before it"
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          change === 0 ? 'text-gray-400' : better ? 'text-status-success-text' : 'text-status-danger-text'
                        }`}
                      >
                        {change > 0 ? `+${change}` : change}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
