import { useQuery } from '@tanstack/react-query'
import { ATTENDANCE_CLOSES_MIN, attendanceTimeLabel, fetchOwnAttendanceClosesMin } from './attendance'

/** When the signed-in contributor's attendance closes today (their team's time, or the default). */
export function useAttendanceClosesMin(): { closesMin: number; closesLabel: string } {
  // Until it loads, the default; file_attendance() checks the real time either way. Re-read every
  // minute, so a lead moving the time is picked up without a reload.
  const { data: closesMin = ATTENDANCE_CLOSES_MIN } = useQuery({
    queryKey: ['attendance-closes-min'],
    queryFn: fetchOwnAttendanceClosesMin,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  return { closesMin, closesLabel: attendanceTimeLabel(closesMin) }
}
