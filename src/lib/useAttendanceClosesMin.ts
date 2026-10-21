import { useQuery } from '@tanstack/react-query'
import { ATTENDANCE_CLOSES_MIN, attendanceTimeLabel, fetchOwnAttendanceClosesMin } from './attendance'

/** When the signed-in contributor's attendance closes today (their team's time, or the default). */
export function useAttendanceClosesMin(): { closesMin: number; closesLabel: string } {
  // Until it loads, the default; file_attendance() checks the real time either way.
  const { data: closesMin = ATTENDANCE_CLOSES_MIN } = useQuery({
    queryKey: ['attendance-closes-min'],
    queryFn: fetchOwnAttendanceClosesMin,
    staleTime: 60_000,
  })
  return { closesMin, closesLabel: attendanceTimeLabel(closesMin) }
}
