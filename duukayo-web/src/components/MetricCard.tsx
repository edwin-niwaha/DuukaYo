import Icon from "./Icon";

export default function MetricCard({ label, value, note, icon, tone = "green" }: {
  label: string; value: string | number; note: string; icon: string;
  tone?: "green" | "amber" | "blue" | "purple";
}) {
  return <article className={`metric-card metric-${tone}`}>
    <div className="metric-top"><span className="metric-icon"><Icon name={icon} /></span><p>{label}</p></div>
    <strong className="metric-value">{value}</strong>
    <p className="metric-note">{note}</p>
  </article>;
}
