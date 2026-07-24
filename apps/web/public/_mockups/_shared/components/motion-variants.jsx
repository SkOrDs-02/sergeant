// motion-variants.jsx — 5 React components, one per Sergeant motion concept.
// All animations are pure CSS @keyframes (see <style> in main HTML),
// each on the variant's own loop duration so artboards can play in parallel.

// ─────────────────────────────────────────────────────────────
// A · BRAND REVEAL — Sergeant lockup, mark quadrants fade in
//                    in module-colour order, wordmark slides
//                    in from the left, tagline lands underneath.
//                    Loops every 4s.
// ─────────────────────────────────────────────────────────────
function VariantBrand() {
  return (
    <div className="m1">
      <div className="m1-bg" />
      <div className="m1-corner">A · Brand reveal</div>
      <div className="m1-corner r">4s loop · 1280 × 720</div>

      <div className="m1-lockup">
        <div className="m1-mark">
          <div className="q1" />
          <div className="q2" />
          <div className="q3" />
          <div className="q4" />
        </div>
        <div className="m1-wordmark">Sergeant</div>
      </div>

      <div className="m1-tagline">Твій персональний хаб життя.</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// B · FIVE → ONE — Five competitor app tiles arranged around
//                  the centre; each scales in, holds, then
//                  collapses inward into the Sergeant hub mark.
//                  Caption lands at the end. 6s loop.
// ─────────────────────────────────────────────────────────────
function VariantFiveToOne() {
  return (
    <div className="m2">
      <div className="m2-corner">B · Five → One</div>

      <div className="m2-stage">
        <div className="m2-tile t1">Mono<span className="lbl">фінанси</span></div>
        <div className="m2-tile t2">MFP<span className="lbl">їжа</span></div>
        <div className="m2-tile t3">Strava<span className="lbl">тренування</span></div>
        <div className="m2-tile t4">Fab<span className="lbl">звички</span></div>
        <div className="m2-tile t5">YNAB<span className="lbl">бюджет</span></div>

        <div className="m2-hub">
          <div className="q1" />
          <div className="q2" />
          <div className="q3" />
          <div className="q4" />
        </div>
      </div>

      <div className="m2-caption">
        П'ять додатків. <span className="accent">Один хаб.</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// C · AI БАЧИТЬ УСЕ — Four module nodes pulse data particles
//                     into a central AI core. Left side cycles
//                     through three rotating insight examples.
//                     Web hero, 8s loop.
// ─────────────────────────────────────────────────────────────
function VariantAI() {
  return (
    <div className="m3">
      <div className="m3-corner">C · AI sees everything</div>

      <div className="m3-left">
        <div className="m3-eyebrow">HubChat · крос-модульний інсайт</div>
        <h2 className="m3-title">AI бачить ввесь твій день.</h2>

        <div className="m3-bubble-stack">
          <div className="m3-bubble b1">
            «Ти витратив ₴2 400 на доставку — і пропустив 3 тренування. Запропонувати meal-prep на неділю?»
          </div>
          <div className="m3-bubble b2">
            «Стрік ранкової рутини під загрозою — вчора ліг о 2:00. Перенести нагадування на 7:30?»
          </div>
          <div className="m3-bubble b3">
            «Бюджет на каву перевищено на 38 %. Замість Aroma — Nova Posta-pickup кави на тиждень?»
          </div>
        </div>
      </div>

      <div className="m3-right">
        <div className="m3-orbit">
          <div className="m3-orbit-ring" />
          <div className="m3-core">AI<span className="sub">HubChat</span></div>

          <div className="m3-node n1">
            <div className="lbl">Фінік</div>
            <div className="val">−₴2 400<br />доставка</div>
          </div>
          <div className="m3-node n2">
            <div className="lbl">Фізрук</div>
            <div className="val">3 / 5<br />тренувань</div>
          </div>
          <div className="m3-node n3">
            <div className="lbl">Рутина</div>
            <div className="val">14 днів<br />at risk</div>
          </div>
          <div className="m3-node n4">
            <div className="lbl">Їжа</div>
            <div className="val">+18 %<br />калорій</div>
          </div>

          <div className="m3-particle p1" />
          <div className="m3-particle p2" />
          <div className="m3-particle p3" />
          <div className="m3-particle p4" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// D · DAY IN LIFE — Vertical Reels/TikTok format. Phone-shaped
//                   inner frame scrolls through four module-
//                   tinted scenes (6:30 routine → 13:00 coffee
//                   → 18:00 workout → 20:00 meal). 12s loop.
// ─────────────────────────────────────────────────────────────
function VariantDayInLife() {
  return (
    <div className="m4">
      <div className="m4-corner">D · Day in life · Reels 9:16</div>

      <div className="m4-frame">
        <div className="m4-status">
          <span>9:41</span>
          <span>Sergeant</span>
        </div>

        <div className="m4-scenes">
          {/* Scene 1 — Morning routine */}
          <div className="m4-scene s1">
            <div>
              <div className="m4-time">6:30 · ранок</div>
              <div className="m4-tag" style={{ color: 'var(--routine)', marginTop: 24 }}>
                <span className="swatch" style={{ background: 'var(--routine)' }} />
                Рутина
              </div>
            </div>
            <div>
              <p className="m4-big">14 днів</p>
              <p className="m4-desc">Ранкова зарядка · стрік збережено</p>
            </div>
            <div className="m4-foot">Стрік горить · 🔥</div>
          </div>

          {/* Scene 2 — Coffee transaction */}
          <div className="m4-scene s2">
            <div>
              <div className="m4-time">13:00 · обід</div>
              <div className="m4-tag" style={{ color: 'var(--finyk)', marginTop: 24 }}>
                <span className="swatch" style={{ background: 'var(--finyk)' }} />
                Фінік
              </div>
            </div>
            <div>
              <p className="m4-big">−₴89</p>
              <p className="m4-desc">Кава · Aroma · авто-категорія</p>
            </div>
            <div className="m4-foot">Mono sync · 0.3s</div>
          </div>

          {/* Scene 3 — Workout */}
          <div className="m4-scene s3">
            <div>
              <div className="m4-time">18:30 · вечір</div>
              <div className="m4-tag" style={{ color: 'var(--fizruk)', marginTop: 24 }}>
                <span className="swatch" style={{ background: 'var(--fizruk)' }} />
                Фізрук
              </div>
            </div>
            <div>
              <p className="m4-big">4.2 т</p>
              <p className="m4-desc">Chest day · 45 хв · 12 вправ</p>
            </div>
            <div className="m4-foot">Тоннаж · PR · +6 %</div>
          </div>

          {/* Scene 4 — Meal log */}
          <div className="m4-scene s4">
            <div>
              <div className="m4-time">20:15 · вечеря</div>
              <div className="m4-tag" style={{ color: 'var(--nutrition)', marginTop: 24 }}>
                <span className="swatch" style={{ background: 'var(--nutrition)' }} />
                Харчування
              </div>
            </div>
            <div>
              <p className="m4-big">1 840 ккал</p>
              <p className="m4-desc">AI-фото · лосось + кіноа · 38P / 64C / 22F</p>
            </div>
            <div className="m4-foot">У межах макро · -160 до ліміту</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// E · STREAK CELEBRATION — Dark canvas. Coral progress ring
//                          sweeps from 0 → 360°, big "14"
//                          pops in with elastic ease, particle
//                          burst, caption settles. 5s loop.
// ─────────────────────────────────────────────────────────────
function VariantStreak() {
  // Pre-computed burst directions for 16 particles around the centre.
  const particles = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const r1 = 180 + (i % 3) * 24;
      const r2 = r1 + 80;
      const colour = ['#c23a3a', '#f97066', '#faf7f1', '#fbcfc7'][i % 4];
      const size = i % 5 === 0 ? '' : ' s';
      arr.push({
        tx: Math.round(Math.cos(angle) * r1) + 'px',
        ty: Math.round(Math.sin(angle) * r1) + 'px',
        tx2: Math.round(Math.cos(angle) * r2) + 'px',
        ty2: Math.round(Math.sin(angle) * r2) + 'px',
        bg: colour,
        cls: 'm5-particle' + size,
      });
    }
    return arr;
  }, []);

  return (
    <div className="m5">
      <div className="m5-corner">E · Streak celebration</div>
      <div className="m5-bg-glow" />

      <div className="m5-ring-wrap">
        <svg className="m5-ring" viewBox="0 0 520 520">
          <circle className="track" cx="260" cy="260" r="230" />
          <circle className="fill"  cx="260" cy="260" r="230" />
        </svg>
        <div className="m5-num">14</div>

        {particles.map((p, i) => (
          <div
            key={i}
            className={p.cls}
            style={{
              background: p.bg,
              top: '50%', left: '50%',
              ['--tx']: p.tx, ['--ty']: p.ty,
              ['--tx2']: p.tx2, ['--ty2']: p.ty2,
              animationDelay: (i * 0.02) + 's',
            }}
          />
        ))}
      </div>

      <div className="m5-label">днів стрік збережено</div>
      <div className="m5-sub">Ранкова рутина · не зламай!</div>
    </div>
  );
}

// ── exports ──────────────────────────────────────────────────
Object.assign(window, {
  VariantBrand,
  VariantFiveToOne,
  VariantAI,
  VariantDayInLife,
  VariantStreak,
});
