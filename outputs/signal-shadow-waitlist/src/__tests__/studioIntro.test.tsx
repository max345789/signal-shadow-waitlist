import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioIntro from '../components/StudioIntro'

describe('studio intro splash', () => {
  it('uses animated text instead of the logo on the splash screen', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const { container } = render(<StudioIntro onComplete={vi.fn()} />)

    expect(container.querySelector('.studio-intro__mark img')).not.toBeInTheDocument()
    expect(screen.getByText('Maxwel')).toBeInTheDocument()
    expect(screen.getByText('Game')).toBeInTheDocument()
    expect(screen.getByText('Studio')).toBeInTheDocument()
  })
})
