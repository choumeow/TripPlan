import styles from './BoardingPassCard.module.css'

/**
 * The signature surface. Frames page content as a boarding pass:
 * an eyebrow + monospace code header over a dashed rule, the content body,
 * a perforation with ticket notches, and an origin→destination stub.
 */
export function BoardingPassCard({ eyebrow, code, children }) {
  return (
    <section className={styles.pass}>
      <header className={styles.head}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        {code && <span className={styles.code}>{code}</span>}
      </header>

      <div>{children}</div>

      <div className={styles.perforation} aria-hidden="true" />
      <div className={styles.stub} aria-hidden="true">
        <span className={styles.pin} />
        <span className={styles.line} />
        <span className={styles.pin} />
      </div>
    </section>
  )
}
