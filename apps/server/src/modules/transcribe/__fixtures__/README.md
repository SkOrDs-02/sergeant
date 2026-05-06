# Transcribe e2e fixtures

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

Бінарні fixture-и для `transcribe-usd-cap.e2e.test.ts`. Тримаємо їх у репо
(а не генеруємо в `beforeAll`), щоб тести були детерміновані: розмір файлу
визначає `estimateMicros()`, тож зміна fixture-а змінює очікувані значення
у тесті.

## `silence-5s.wav`

5-секундна синусоїда 440 Hz, mono, 16 kHz, PCM 16-bit. Зашита як WAV/RIFF.
Розмір ≈ 156 KB → `estimateMicros() ≈ 610 micros` ($0.00061) при тарифі
40_000 micros / 10 MB. Обрано як baseline-fixture: достатньо великий, щоб
linear scaling був не-zero, і достатньо малий, щоб лежати в репо без
LFS.

### Регенерація

```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=5" \
  -ac 1 -ar 16000 -sample_fmt s16 \
  silence-5s.wav -y
```

Якщо змінюєш fixture — оновлюй expected-розрахунок у тесті відповідно.
`estimateMicros()` — це `Math.ceil(bytes / 10MB * 40_000)`, тож округлення
вгору при будь-якій зміні розміру.

### Чому "silence", якщо це синусоїда

Назва історична: оригінальний план був реальний silent buffer, але Whisper
може повертати порожній transcript для `<-30dBFS`, а нам потрібна
детермінована не-empty відповідь. 440 Hz sine дає Whisper достатньо
сигналу, щоб не обрізати. У тесті ми все одно мокаємо `transcribeAudio`,
тож якість аудіо не перевіряється — важливий тільки розмір файлу.
