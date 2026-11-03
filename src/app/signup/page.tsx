import { SiteBar } from "@/components/site-bar";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-dot-grid">
      <SiteBar />
      <AuthForm mode="signup" />
    </main>
  );
}
