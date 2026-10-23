export const dynamic = "force-dynamic";

export function GET() {
  const apiUrl =
    process.env.LISA_API_URL ??
    process.env.NEXT_PUBLIC_LISA_API_URL ??
    "http://localhost:8008";

  return Response.json(
    { apiUrl },
    { headers: { "Cache-Control": "no-store" } },
  );
}
