export default function GoalCategoryOrderButtons({ category, index, count, disabled, onMove, style }) {
  if (count < 2) return null;
  return <>
    <button type="button" title="Move category up" aria-label={`Move category ${category} up`}
      disabled={disabled || index === 0} onClick={() => onMove(-1)} style={style}>↑</button>
    <button type="button" title="Move category down" aria-label={`Move category ${category} down`}
      disabled={disabled || index === count - 1} onClick={() => onMove(1)} style={style}>↓</button>
  </>;
}
