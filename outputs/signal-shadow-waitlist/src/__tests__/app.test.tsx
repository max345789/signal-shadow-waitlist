import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'

describe('landing page reveal contract', () => {
  it('does not mount countdown markup before email submit', () => {
    render(
      <App
        forceIntroComplete
        signupClient={async () => ({ display_id: 'SW-4X9K2', referral_code: 'ABC123', success: true })}
      />,
    )

    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument()
    expect(screen.queryByText(/release signal/i)).not.toBeInTheDocument()
  })

  it('mounts countdown and player id after a successful signup', async () => {
    const signupClient = vi.fn(async () => ({
      display_id: 'SW-4X9K2',
      referral_code: 'ABC123',
      success: true as const,
    }))

    render(<App forceIntroComplete signupClient={signupClient} />)

    await userEvent.type(screen.getByLabelText(/email/i), 'player@example.com')
    await userEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => expect(screen.getByTestId('countdown')).toBeInTheDocument())
    expect(screen.getByText('SW-4X9K2')).toBeInTheDocument()
    expect(signupClient).toHaveBeenCalledWith({
      email: 'player@example.com',
      referred_by: null,
    })
  })
})
