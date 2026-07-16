export default function SkeletonResultado() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Calculando tu nómina">
      <div className="skeleton h-24 rounded-2xl" />
      <div className="skeleton h-3 rounded-full" />
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-9 h-9 rounded-lg shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton h-2.5 w-1/3" />
            </div>
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
