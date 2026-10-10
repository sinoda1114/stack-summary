import { Stack, Table, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { type TechStatus } from "../../shared/labels";
import { requestJson } from "../api";
import { TechStatusMark } from "../components/StatusMark";

type Comparison = {
  name: string;
  categoryName: string;
  techs: {
    id: string;
    name: string;
    status: TechStatus;
    reason: string | null;
    memoCount: number;
    updatedAt: string;
  }[];
};

export function SubcategoryPage() {
  const params = useParams();
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (params.id === undefined) {
      return;
    }
    const subcategoryId = params.id;
    let current = true;
    void requestJson<Comparison>(`/api/subcategories/${subcategoryId}`).then((result) => {
      if (!current) {
        return;
      }
      if (!result.success) {
        setComparison(null);
        setNotice(result.error?.message ?? "小分類を取得できませんでした");
        return;
      }
      setNotice(null);
      setComparison(result.data);
    });
    return () => {
      current = false;
    };
  }, [params.id]);

  if (notice !== null && comparison === null) {
    return <Text className="note">{notice}</Text>;
  }
  if (comparison === null) {
    return <Text className="meta">読み込み中</Text>;
  }

  return (
    <Stack className="page" gap="lg">
      <Title order={1}>
        {comparison.categoryName} / {comparison.name}
      </Title>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>技術</Table.Th>
            <Table.Th>状態</Table.Th>
            <Table.Th>理由</Table.Th>
            <Table.Th>メモ</Table.Th>
            <Table.Th>更新</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {comparison.techs.map((tech) => (
            <Table.Tr key={tech.id}>
              <Table.Td>
                <Link to={`/techs/${tech.id}`}>{tech.name}</Link>
              </Table.Td>
              <Table.Td>
                <TechStatusMark status={tech.status} />
              </Table.Td>
              <Table.Td>{tech.reason ?? ""}</Table.Td>
              <Table.Td>{tech.memoCount}</Table.Td>
              <Table.Td>{tech.updatedAt}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
