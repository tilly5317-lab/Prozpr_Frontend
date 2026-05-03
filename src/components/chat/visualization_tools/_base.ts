// Shared base — every chart payload carries these.
export interface ChartBase {
  schema_version: "v1";
  title: string;
  subtitle?: string | null;
}
