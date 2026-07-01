import { useEffect, useRef, useState } from 'react'

type StudioIntroProps = {
  onComplete: () => void
}

const INTRO_KEY = 'maxwel_intro_played'
const INTRO_DURATION_MS = 5600
const INTRO_WORDS = ['Maxwel', 'Game', 'Studio']

export function hasPlayedIntro(): boolean {
  return sessionStorage.getItem(getTabIntroKey()) === 'true'
}

function setIntroPlayed(): void {
  sessionStorage.setItem(getTabIntroKey(), 'true')
}

function getTabIntroKey(): string {
  if (!window.name.startsWith('maxwel-tab-')) {
    window.name = `maxwel-tab-${crypto.randomUUID()}`
  }

  return `${INTRO_KEY}:${window.name}`
}

export default function StudioIntro({ onComplete }: StudioIntroProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [phase, setPhase] = useState<'static' | 'resolve' | 'zoom' | 'fade'>('static')

  useEffect(() => {
    let animationFrame = 0
    let completed = false
    const startedAt = performance.now()
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { alpha: false })

    const resize = () => {
      if (!canvas) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * ratio)
      canvas.height = Math.floor(window.innerHeight * ratio)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }

    const finish = () => {
      if (completed) return
      completed = true
      setIntroPlayed()
      onComplete()
    }

    const draw = (now: number) => {
      if (!canvas || !context) return

      const progress = Math.min((now - startedAt) / INTRO_DURATION_MS, 1)
      const width = canvas.width
      const height = canvas.height
      const image = context.createImageData(width, height)
      const density = Math.max(0.08, 1 - progress * 1.35)

      for (let index = 0; index < image.data.length; index += 4) {
        const value = Math.random() < density ? Math.random() * 255 : 8 + progress * 18
        image.data[index] = value
        image.data[index + 1] = value
        image.data[index + 2] = value
        image.data[index + 3] = 255
      }

      context.putImageData(image, 0, 0)

      if (progress > 0.18 && progress < 0.72) {
        setPhase('resolve')
      }

      if (progress >= 0.72 && progress < 0.92) {
        setPhase('zoom')
      }

      if (progress >= 0.92) {
        setPhase('fade')
      }

      if (progress < 1) {
        animationFrame = requestAnimationFrame(draw)
      } else {
        finish()
      }
    }

    resize()
    window.addEventListener('resize', resize)
    animationFrame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', resize)
    }
  }, [onComplete])

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    let audioContext: AudioContext | null = null
    let noiseSource: AudioBufferSourceNode | null = null
    let oscillator: OscillatorNode | null = null

    try {
      audioContext = new AudioContextClass()
      const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2.6, audioContext.sampleRate)
      const samples = noiseBuffer.getChannelData(0)
      const noiseGain = audioContext.createGain()
      const humGain = audioContext.createGain()
      const filter = audioContext.createBiquadFilter()

      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length)
      }

      noiseSource = audioContext.createBufferSource()
      oscillator = audioContext.createOscillator()

      noiseSource.buffer = noiseBuffer
      noiseSource.loop = true
      filter.type = 'bandpass'
      filter.frequency.value = 1600
      filter.Q.value = 0.7
      noiseGain.gain.value = 0.022
      humGain.gain.value = 0.012
      oscillator.type = 'sawtooth'
      oscillator.frequency.value = 52

      noiseSource.connect(filter).connect(noiseGain).connect(audioContext.destination)
      oscillator.connect(humGain).connect(audioContext.destination)
      noiseSource.start()
      oscillator.start()
      noiseGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 4.7)
      humGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 4.7)
      noiseSource.stop(audioContext.currentTime + 4.85)
      oscillator.stop(audioContext.currentTime + 4.85)
    } catch {
      // Autoplay policies can block audio; the visual intro should continue quietly.
    }

    return () => {
      try {
        noiseSource?.stop()
        oscillator?.stop()
        void audioContext?.close()
      } catch {
        // Audio nodes may already be stopped by the scheduled ramp.
      }
    }
  }, [])

  return (
    <section className={`studio-intro studio-intro--${phase}`} aria-label="Maxwel Game Studio intro">
      <canvas ref={canvasRef} className="studio-intro__static" />
      <div className="studio-intro__mark" aria-hidden={phase === 'static'}>
        <span className="studio-intro__text" aria-label="Maxwel Game Studio">
          {INTRO_WORDS.map((word, index) => (
            <span className="studio-intro__word" style={{ '--word-index': index } as React.CSSProperties} key={word}>
              {word}
            </span>
          ))}
        </span>
      </div>
    </section>
  )
}
