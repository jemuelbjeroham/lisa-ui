
"use client";

import styles from "./landing.module.css";

export default function Landing() {
  return (
    <main className={styles.screen}>
      <div className={styles.stage}>
        <div
          className={styles.reference}
          role="img"
          aria-label="LISA futuristic holographic HUD"
        />

        <div className={styles.hologramArmor} aria-hidden="true" />
        <div className={styles.hologramTank} aria-hidden="true" />

        <div className={styles.target} aria-hidden="true">
          <div className={`${styles.ring} ${styles.ringOuter}`} />
          <div className={`${styles.ring} ${styles.ringMiddle}`} />
          <div className={`${styles.ring} ${styles.ringInner}`} />
        </div>

        <div className={styles.identity} aria-label="L.I.S.A">
          L.I.S.A
        </div>

        <a className={styles.login} href="/sign-in">
          LOGIN <span aria-hidden="true">↗</span>
        </a>
      </div>
    </main>
  );
}
