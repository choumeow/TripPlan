import styles from './ComingSoon.module.css'

export function ComingSoon({ section }) {
  return (
    <section className={styles.wrap}>
      <span className={styles.badge} aria-hidden="true">🚧</span>
      <h2 className={styles.title}>{section} is coming soon</h2>
      <p className={styles.text}>This section lands in a later update. For now, head back to the Overview.</p>
    </section>
  )
}
