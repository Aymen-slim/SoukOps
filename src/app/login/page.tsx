import { SiteBar } from "@/components/site-bar";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="wassalha-public min-h-screen">
      <SiteBar />
      <AuthForm mode="login" />
    </main>
  );
}
