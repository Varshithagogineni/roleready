import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Target } from "lucide-react"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.16-3.16A11 11 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  )
}

interface Props {
  onGoogleSignIn: () => void
}

/** Full-page sign-in gate shown before the app. */
export function LoginScreen({ onGoogleSignIn }: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="logo-pop flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
          <Target className="size-6" />
        </div>
        <h1 className="anim-fade-up anim-d1 text-3xl font-bold tracking-tight">
          Welcome to{" "}
          <span className="bg-gradient-to-r from-indigo-500 to-violet-600 bg-clip-text text-transparent">
            RoleReady
          </span>
        </h1>
        <p className="anim-fade-up anim-d2 max-w-md text-muted-foreground">
          Company intel, visa-sponsorship signals, real interview questions,
          people to connect with, and a resume tailored to the role.
        </p>
      </div>

      <Card className="anim-fade-up anim-d3 w-full max-w-sm shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <Button size="lg" className="w-full" variant="outline" onClick={onGoogleSignIn}>
            <GoogleIcon />
            Continue with Google
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            We only use your Google name and email to set up your account.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
