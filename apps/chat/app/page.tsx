import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>SSO Kit Chat</h1>
      <p>
        <Link href="/protected">Open protected chat</Link>
      </p>
    </main>
  );
}
