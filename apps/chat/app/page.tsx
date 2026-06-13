import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>SSO Kit Chat</CardTitle>
          <CardDescription>
            A demo consumer app with no login of its own. It trusts the shared SSO session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/protected" className={buttonClasses({ className: "w-full" })}>
            Open protected area
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
