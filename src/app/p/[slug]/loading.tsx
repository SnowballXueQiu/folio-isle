export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 fade-in" aria-busy>
      <div className="skeleton h-8 w-48" />
      <div className="mt-5 grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16" style={{ opacity: 1 - i * 0.18 }} />
        ))}
      </div>
    </div>
  );
}
