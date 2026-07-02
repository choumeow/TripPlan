import { tripDays, monthDay } from '../lib/tripDates'
import styles from './PlanningSchedule.module.css'

// #3a: a non-functional preview of the day-by-day plan. #3c seeds it from a template;
// #3b turns the columns into real drop targets (drag suggestions in) with times.
export function PlanningSchedule({ trip }) {
  const days = tripDays(trip)
  return (
    <section className={styles.wrap} aria-label="Planning schedule">
      <p className={styles.note}>Your day-by-day plan — drag suggestions in here (coming soon).</p>
      <div className={styles.days}>
        {days.map((d) => (
          <div key={d.index} className={styles.day}>
            <div className={styles.dhead}>Day {d.index} · {monthDay(d.date)}</div>
            <div className={styles.drop}>drop a suggestion here</div>
          </div>
        ))}
      </div>
    </section>
  )
}
