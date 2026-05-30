interface DataTableProps {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Plain table used as the screen-reader fallback for a chart. Rendered inside
 * a `.visually-hidden` wrapper by <EChart>, so it carries the data the canvas
 * conveys visually.
 */
export default function DataTable({
  caption,
  columns,
  rows,
}: DataTableProps): JSX.Element {
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
