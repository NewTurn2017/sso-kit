import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>SSO Kit Auth</h1>
      <p>Email/password auth portal.</p>
      <Link href="/login">Login</Link>
    </main>
  );
}
