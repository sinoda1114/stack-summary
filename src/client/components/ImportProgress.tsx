import { Table, Text } from "@mantine/core";
import { IMPORT_STATUS_LABELS } from "../../shared/labels";
import type { ImportItem } from "../api";

export function ImportProgress(props: { rows: readonly ImportItem[] }) {
  if (props.rows.length === 0) {
    return <Text>取り込み履歴はまだありません。</Text>;
  }
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>状態</Table.Th>
          <Table.Th>メモ</Table.Th>
          <Table.Th>対象外</Table.Th>
          <Table.Th>エラー</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {props.rows.map((row) => (
          <Table.Tr key={row.id}>
            <Table.Td>{IMPORT_STATUS_LABELS[row.status]}</Table.Td>
            <Table.Td>{row.memoCount}</Table.Td>
            <Table.Td>{row.skippedCount}</Table.Td>
            <Table.Td>{row.error ?? ""}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
