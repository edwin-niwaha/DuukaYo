import type { InputHTMLAttributes } from "react";
import Icon from "./Icon";

export default function SearchField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="compact-search-field"><span className="sr-only">{label}</span><Icon name="search" /><input {...props} type="search" placeholder={props.placeholder || label} /></label>;
}
