import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { postJson, type Session } from './api'
import {
  Accordion,
  Badge,
  Button,
  Card,
  Checkbox,
  FormDescription,
  FormLabel,
  FormMessage,
  Input,
} from './components/ui'
import './SignIn.css'

const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid work email address.').max(254),
  password: z.string().min(1, 'Enter your password.').max(256),
  remember_me: z.boolean(),
})
type SignInValues = z.infer<typeof signInSchema>

export function SignIn({
  onSignIn,
  notice,
}: {
  onSignIn: (session: Session) => void
  notice?: string
}) {
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', remember_me: false },
  })
  async function submit(values: SignInValues) {
    try {
      onSignIn(await postJson<Session>('/auth/login', values))
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Sign-in failed. Please try again.',
      })
    }
  }
  return (
    <div className="signin-container">
      <aside className="signin-left-pane" aria-label="About Meridian">
        <div className="signin-left-content">
          <header className="signin-brand-header">
            <span className="brand-mark" aria-hidden="true">
              <Building2 size={28} />
            </span>
            <div>
              <h1 className="signin-brand-name">Meridian Brokerage Group</h1>
              <p className="signin-brand-motto">People. Protection. Progress.</p>
            </div>
          </header>
          <div className="signin-hero-section">
            <p className="eyebrow">Clarity for every client conversation</p>
            <h2 className="signin-hero-title">Walk into every renewal prepared.</h2>
            <p className="signin-hero-subtitle">
              Your clients, your priorities, and the evidence behind every risk and opportunity.
            </p>
            <div className="signin-features-list">
              {[
                ['Evidence first.', 'Sources, dates and confidence stay alongside every insight.'],
                [
                  'A workspace for your role.',
                  'Your book of business or your authorized regional portfolio.',
                ],
                [
                  'Human judgment at the center.',
                  'Clear distinctions between confirmed facts and hypotheses.',
                ],
              ].map(([title, copy], index) => (
                <div className="signin-feature-item" key={title}>
                  <span className="feature-number-badge">{index + 1}</span>
                  <div className="feature-text">
                    <strong>{title}</strong>
                    {copy}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <footer className="signin-left-footer">
            Synthetic demo data only. Meridian is a fictional broker.
          </footer>
        </div>
      </aside>
      <main className="signin-right-pane" id="main-content">
        <Card className="signin-card" aria-labelledby="signin-title">
          <p className="eyebrow">Your client intelligence workspace</p>
          <h2 id="signin-title" className="signin-card-title">
            Sign in
          </h2>
          <p className="signin-card-subtitle">Use your work account to open your workspace.</p>
          {notice && (
            <p className="signin-notice" role="status">
              {notice}
            </p>
          )}
          <form className="signin-form" onSubmit={handleSubmit(submit)} noValidate>
            <div className="role-callout-box">
              <LockKeyhole size={16} aria-hidden="true" />
              <p>Your role and client access are assigned to your account.</p>
            </div>
            <div>
              <FormLabel htmlFor="work-email">Work email</FormLabel>
              <Input
                id="work-email"
                type="email"
                autoComplete="username"
                autoFocus
                disabled={isSubmitting}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : 'email-help'}
                {...register('email')}
              />
              {errors.email ? (
                <FormMessage id="email-error">{errors.email.message}</FormMessage>
              ) : (
                <FormDescription id="email-help">
                  Enter the email assigned to your Meridian account.
                </FormDescription>
              )}
            </div>
            <div>
              <FormLabel htmlFor="password">Password</FormLabel>
              <div className="password-field">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  disabled={isSubmitting}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {errors.password && (
                <FormMessage id="password-error">{errors.password.message}</FormMessage>
              )}
            </div>
            <div className="checkbox-label">
              <Controller
                control={control}
                name="remember_me"
                render={({ field }) => (
                  <Checkbox
                    id="remember-me"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    disabled={isSubmitting}
                  />
                )}
              />
              <FormLabel htmlFor="remember-me">Remember me on this device</FormLabel>
            </div>
            {errors.root && <FormMessage>{errors.root.message}</FormMessage>}
            <Button
              className="button-submit-signin"
              variant="default"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
              <ArrowRight />
            </Button>
          </form>
          <div className="demo-accounts">
            <Accordion
              sections={[
                {
                  id: 'demo-accounts',
                  title: 'Synthetic demo accounts',
                  content: (
                    <>
                      <p>
                        Password for all three: <code>MeridianDemo!2026</code>
                      </p>
                      {[
                        ['Jordan Davis', 'jordan.davis@meridian.example', 'Producer'],
                        ['Priya Nair', 'priya.nair@meridian.example', 'Producer'],
                        ['Morgan Hayes', 'morgan.hayes@meridian.example', 'Regional Leader'],
                      ].map(([name, email, role]) => (
                        <Button
                          className="demo-account"
                          key={email}
                          disabled={isSubmitting}
                          onClick={() => {
                            setValue('email', email)
                            setValue('password', 'MeridianDemo!2026')
                            clearErrors()
                          }}
                        >
                          <strong>{name}</strong>
                          <Badge>{role}</Badge>
                          <small>{email}</small>
                        </Button>
                      ))}
                    </>
                  ),
                },
              ]}
            />
          </div>
          <p className="signin-card-footer">
            Access is limited to your authorized clients. Sign-in and record access are logged.
          </p>
        </Card>
      </main>
    </div>
  )
}
