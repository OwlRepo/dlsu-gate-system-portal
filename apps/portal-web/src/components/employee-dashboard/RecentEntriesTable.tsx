import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getLogEntries, type LogEntry } from '../../lib/dummyData';

export default function RecentEntriesTable() {
  const recentEntries = getLogEntries(10);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Recent Entries</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Turnstile</TableHead>
            <TableHead>Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recentEntries.map((entry: LogEntry) => (
            <TableRow key={entry.id}>
              <TableCell>{entry.id}</TableCell>
              <TableCell>{entry.name}</TableCell>
              <TableCell>{entry.turnstile}</TableCell>
              <TableCell>{entry.timestamp}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
