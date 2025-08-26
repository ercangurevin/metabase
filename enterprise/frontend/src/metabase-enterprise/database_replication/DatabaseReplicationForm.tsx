import { useEffect, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  Form,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "metabase/forms";
import { colors } from "metabase/lib/colors";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import {
  Box,
  Card,
  Divider,
  Flex,
  Group,
  Icon,
  List,
  Loader,
  Progress,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type {
  PreviewDatabaseReplicationResponse,
  TableInfo,
} from "metabase-enterprise/api/database-replication";
import type { Database, DatabaseId } from "metabase-types/api";

// const styles = {
//   wrapperProps: {
//     fw: 400,
//   },
//   labelProps: {
//     fz: "0.875rem",
//     mb: "0.75rem",
//   },
// };

export interface DatabaseReplicationFormFields {
  databaseId: DatabaseId;
  schemaFiltersType: "all" | "include" | "exclude";
  schemaFiltersPatterns: string;
}

const validationSchema = Yup.object({
  schemaFiltersType: Yup.string().oneOf(["all", "include", "exclude"]),
  schemaFiltersPatterns: Yup.string(),
});

type IFieldError =
  | string
  | {
      message: string;
    }
  | {
      errors: { [key: string]: any };
    };

const isFieldError = (error: unknown): error is IFieldError =>
  typeof error === "string" ||
  (error instanceof Object &&
    (("message" in error && typeof error.message === "string") ||
      ("errors" in error &&
        error.errors instanceof Object &&
        "schemas" in error.errors &&
        typeof error.errors.schemas === "string")));

export const handleFieldError = (error: unknown) => {
  if (isFieldError(error)) {
    if (typeof error === "string") {
      throw { data: { errors: { schemas: error } } };
    } else if ("message" in error) {
      throw { data: { errors: { schemas: error.message } } };
    } else if ("errors" in error) {
      throw { data: error };
    }
  }
};

const compactEnglishNumberFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// JavaScript 2024 `Set.union` does not appear to be available?
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/union
const unionInPlace = <T,>(set: T[], values?: T[]) => {
  values?.forEach((v) => {
    if (!set.includes(v)) {
      set.push(v);
    }
  });
};

export const DatabaseReplicationForm = ({
  database,
  onSubmit,
  preview,
  initialValues,
}: {
  database: Database;
  onSubmit: (_: DatabaseReplicationFormFields) => void;
  preview: (
    fields: DatabaseReplicationFormFields,
    handleResponse: (_: PreviewDatabaseReplicationResponse) => void,
    handleError: (error: unknown) => void,
  ) => void;
  initialValues: DatabaseReplicationFormFields;
}) => {
  const storeUrl = useStoreUrl("account/storage");

  // FIXME: Can we get all values of the form at once?
  const [schemaFiltersType, setSchemaFiltersType] = useState(
    initialValues.schemaFiltersType,
  );
  const [schemaFiltersPatterns, setSchemaFiltersPatterns] = useState("");
  const debouncedSchemaFiltersPatterns = useDebouncedValue(
    schemaFiltersPatterns,
    SEARCH_DEBOUNCE_DURATION,
  );
  const isValidSchemaFiltersPatterns = !!debouncedSchemaFiltersPatterns.length;
  const [showNoSyncTables, setShowNoSyncTables] = useState(false);
  const [showReplicatedTables, setShowReplicatedTables] = useState(false);

  const [previewResponseLoading, setPreviewResponseLoading] = useState(false);
  const [previewResponse, setPreviewResponse] =
    useState<PreviewDatabaseReplicationResponse>();
  useEffect(() => {
    setPreviewResponseLoading(true);
    preview(
      {
        databaseId: database.id,
        schemaFiltersType,
        schemaFiltersPatterns: debouncedSchemaFiltersPatterns,
      },
      (res) => {
        setPreviewResponse(res);
        setPreviewResponseLoading(false);
      },
      () => setPreviewResponseLoading(false),
    );
  }, [preview, database.id, debouncedSchemaFiltersPatterns, schemaFiltersType]);

  const storageUtilizationPercent =
    typeof previewResponse?.totalEstimatedRowCount === "number" &&
    typeof previewResponse?.freeQuota === "number" &&
    previewResponse.freeQuota > 0
      ? (previewResponse.totalEstimatedRowCount / previewResponse.freeQuota) *
        100
      : undefined;

  const noSyncTables: TableInfo[] = [];
  unionInPlace(noSyncTables, previewResponse?.tablesWithoutPk);
  unionInPlace(noSyncTables, previewResponse?.tablesWithoutOwnerMatch);

  const replicatedTables = previewResponse?.replicatedTables ?? [];

  const hasNoPk = (table: TableInfo) =>
    previewResponse?.tablesWithoutPk?.includes(table) ?? false;
  const hasOwnerMismatch = (table: TableInfo) =>
    previewResponse?.tablesWithoutOwnerMatch?.includes(table) ?? false;
  const noSyncReason = (table: TableInfo) =>
    hasNoPk(table)
      ? "(no primary key)"
      : hasOwnerMismatch(table)
        ? "(owner mismatch)"
        : undefined;

  return (
    <Stack>
      <FormProvider
        initialValues={initialValues}
        onSubmit={onSubmit}
        validationSchema={validationSchema}
      >
        {({ values }) => (
          <Form>
            <Stack>
              <FormSelect
                name="schemaFiltersType"
                label={t`Select schemas to replicate`}
                onChange={(value) =>
                  setSchemaFiltersType(
                    value as typeof initialValues.schemaFiltersType,
                  )
                }
                data={[
                  { value: "all", label: t`All` },
                  { value: "include", label: t`Only these…` },
                  { value: "exclude", label: t`All except…` },
                ]}
              />

              {values.schemaFiltersType !== "all" && (
                <Box>
                  <Text
                    c="text-secondary"
                    fz="sm"
                  >{t`Comma separated names of schemas that should ${values.schemaFiltersType === "exclude" ? "NOT " : ""}be replicated`}</Text>
                  <FormTextarea
                    name="schemaFiltersPatterns"
                    placeholder="e.g. public, auth"
                    maxRows={5}
                    minRows={2}
                    onChange={({ target: { value } }) =>
                      setSchemaFiltersPatterns(value)
                    }
                  />
                </Box>
              )}

              {
                <Card
                  radius="md"
                  bg="var(--mb-color-bg-light)"
                  p={0}
                  shadow="none"
                >
                  <Flex
                    align="flex-start"
                    direction="row"
                    gap="sm"
                    justify="flex-start"
                    wrap="nowrap"
                    p="md"
                  >
                    <Icon name="info_outline" size={16} maw={16} mt={1} />
                    <Box>
                      <Text fz="md" lh={1.35}>
                        {t`Tables without primary key or with owner mismatch`}{" "}
                        <b>{t`will not be replicated`}</b>.
                      </Text>
                      <UnstyledButton
                        variant="subtle"
                        size="xs"
                        onClick={() => setShowNoSyncTables(!showNoSyncTables)}
                        c="brand"
                        fz="md"
                        h="auto"
                        mt="xs"
                        p={0}
                        w="auto"
                      >
                        <Flex
                          align="center"
                          direction="row"
                          gap="xs"
                          justify="flex-start"
                          wrap="nowrap"
                        >
                          <Text span c="brand">
                            {showNoSyncTables
                              ? t`Hide tables (${noSyncTables.length})`
                              : t`Show tables (${noSyncTables.length})`}
                          </Text>
                          <Icon
                            name={
                              showNoSyncTables ? "chevronup" : "chevrondown"
                            }
                            size={12}
                          />
                        </Flex>
                      </UnstyledButton>
                    </Box>
                  </Flex>

                  {showNoSyncTables && (
                    <>
                      <Divider />
                      <Box
                        mah={180}
                        px="md"
                        style={{
                          overflowY: "auto",
                        }}
                      >
                        <List spacing="xs" size="sm" fz="md" ml="sm" my="md">
                          {noSyncTables.map((table) => (
                            <List.Item
                              key={`${table.tableSchema}.${table.tableName}`}
                              fz="md"
                            >
                              <Text fz="md">
                                <Text
                                  span
                                  c="text-dark"
                                  display="inline"
                                  fw="500"
                                >
                                  {table.tableSchema}
                                </Text>
                                <Text span c="text-medium" display="inline">
                                  .{table.tableName}
                                </Text>{" "}
                                <Text span c="text-light" display="inline">
                                  {noSyncReason(table)}
                                </Text>
                              </Text>
                            </List.Item>
                          ))}
                        </List>
                      </Box>
                    </>
                  )}
                </Card>
              }

              {
                <Card
                  radius="md"
                  bg="var(--mb-color-bg-light)"
                  p={0}
                  shadow="none"
                >
                  <Flex
                    align="flex-start"
                    direction="row"
                    gap="sm"
                    justify="flex-start"
                    wrap="nowrap"
                    p="md"
                  >
                    <Icon name="check" size={16} maw={16} mt={1} />
                    <Box>
                      <Text fz="md" lh={1.35}>
                        {t`The following tables will be replicated.`}
                      </Text>
                      <UnstyledButton
                        variant="subtle"
                        size="xs"
                        onClick={() =>
                          setShowReplicatedTables(!showReplicatedTables)
                        }
                        c="brand"
                        fz="md"
                        h="auto"
                        mt="xs"
                        p={0}
                        w="auto"
                      >
                        <Flex
                          align="center"
                          direction="row"
                          gap="xs"
                          justify="flex-start"
                          wrap="nowrap"
                        >
                          <Text span c="brand">
                            {showReplicatedTables
                              ? t`Hide tables (${replicatedTables.length})`
                              : t`Show tables (${replicatedTables.length})`}
                          </Text>
                          <Icon
                            name={
                              showReplicatedTables ? "chevronup" : "chevrondown"
                            }
                            size={12}
                          />
                        </Flex>
                      </UnstyledButton>
                    </Box>
                  </Flex>

                  {showReplicatedTables && (
                    <>
                      <Divider />
                      <Box
                        mah={180}
                        px="md"
                        style={{
                          overflowY: "auto",
                        }}
                      >
                        <List spacing="xs" size="sm" fz="md" ml="sm" my="md">
                          {replicatedTables.map((table) => (
                            <List.Item
                              key={`${table.tableSchema}.${table.tableName}`}
                              fz="md"
                            >
                              <Text fz="md">
                                <Text
                                  span
                                  c="text-dark"
                                  display="inline"
                                  fw="500"
                                >
                                  {table.tableSchema}
                                </Text>
                                <Text span c="text-medium" display="inline">
                                  .{table.tableName}
                                </Text>
                              </Text>
                            </List.Item>
                          ))}
                        </List>
                      </Box>
                    </>
                  )}
                </Card>
              }

              <Card
                radius="md"
                bg="var(--mb-color-bg-light)"
                p="md"
                my="sm"
                shadow="none"
              >
                <Stack>
                  <Group justify="space-between">
                    <Box ta="left">
                      <Text c="text-light">{database.name}</Text>
                      {!previewResponseLoading &&
                      typeof previewResponse?.totalEstimatedRowCount ===
                        "number" ? (
                        <Text fw="bold">
                          {t`${compactEnglishNumberFormat.format(previewResponse.totalEstimatedRowCount)} rows`}
                        </Text>
                      ) : (
                        <Skeleton height="1.5em" width="10em" />
                      )}
                    </Box>

                    {previewResponseLoading && <Loader />}

                    <Box ta="right">
                      <Text c="text-light">{t`Available Cloud Storage`}</Text>
                      {!previewResponseLoading &&
                      typeof previewResponse?.freeQuota === "number" ? (
                        <Text fw="bold" w="100%">
                          {t`${compactEnglishNumberFormat.format(previewResponse.freeQuota)} rows`}
                        </Text>
                      ) : (
                        <Skeleton height="1.5em" width="10em" />
                      )}
                    </Box>
                  </Group>

                  {!previewResponseLoading &&
                  typeof storageUtilizationPercent === "number" ? (
                    <Progress
                      value={storageUtilizationPercent}
                      color={
                        previewResponse?.canSetReplication
                          ? colors.success
                          : colors.error
                      }
                    />
                  ) : (
                    <Skeleton height="1em" width="100%" />
                  )}

                  {previewResponse && !previewResponse.canSetReplication && (
                    <>
                      <Divider />
                      {replicatedTables.length === 0 ? (
                        <Text>{t`Nothing to replicate. Please select schemas containing at least one table to be replicated.`}</Text>
                      ) : (
                        <>
                          <Text>{t`Not enough storage. Please upgrade your plan or modify the replication scope by excluding schemas.`}</Text>
                          <ExternalLink
                            href={storeUrl}
                          >{t`Get more storage`}</ExternalLink>
                        </>
                      )}
                    </>
                  )}
                </Stack>
              </Card>

              <Flex justify="end">
                <Group align="center" gap="sm">
                  <FormSubmitButton
                    disabled={
                      (isValidSchemaFiltersPatterns &&
                        previewResponseLoading) ||
                      !previewResponse?.canSetReplication
                    }
                    label={t`Start replication`}
                    variant="filled"
                    mt="xs"
                  />
                </Group>
              </Flex>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Stack>
  );
};
