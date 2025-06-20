export function numberWithCommas(x: string | number) {
  const num = Number(x);
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  } else {
    return num.toLocaleString(); // adds commas
  }
}
