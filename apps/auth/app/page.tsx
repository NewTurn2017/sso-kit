import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>SSO Kit</CardTitle>
          <CardDescription>
            The central sign-in portal. Log in once here, stay signed in across every app on your domain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={buttonClasses({ className: "w-full" })}>
            Go to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
