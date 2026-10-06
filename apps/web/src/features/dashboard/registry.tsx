import type { WidgetConfig, WidgetType } from "@pulse/shared";
import { BellRing, ChartColumn, ChartLine, Gauge, Rows3, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { AlertListBody } from "./widgets/alert-list-widget";
import { BarBody } from "./widgets/bar-widget";
import { FeedBody } from "./widgets/feed-widget";
import { KpiBody } from "./widgets/kpi-widget";
import { LineBody } from "./widgets/line-widget";

type Of<K extends WidgetType> = Extract<WidgetConfig, { type: K }>;

interface WidgetDefinition<K extends WidgetType> {
  label: string;
  icon: LucideIcon;
  Body: ComponentType<{ widget: Of<K> }>;
  /** Shows the threshold editor in edit mode. */
  supportsThresholds: boolean;
}

/**
 * THE widget registry. The mapped type `{ [K in WidgetType]: … }` makes
 * TypeScript fail the build if a widget type in the Zod schema has no entry
 * here, or if an entry's Body expects the wrong config shape.
 *
 * Adding a widget to a dashboard = a JSON config change, validated by Zod.
 * Adding a new KIND of widget = one schema member + one entry here.
 */
export const WIDGETS: { [K in WidgetType]: WidgetDefinition<K> } = {
  kpi: { label: "Number", icon: Gauge, Body: KpiBody, supportsThresholds: true },
  line: { label: "Line chart", icon: ChartLine, Body: LineBody, supportsThresholds: true },
  bar: { label: "Bar chart", icon: ChartColumn, Body: BarBody, supportsThresholds: false },
  feed: { label: "Event feed", icon: Rows3, Body: FeedBody, supportsThresholds: false },
  alertList: { label: "Alert list", icon: BellRing, Body: AlertListBody, supportsThresholds: false },
};

/**
 * Render a widget's body from its config. The cast is the one place we tell
 * TypeScript what the mapped type above already guarantees: WIDGETS[w.type]
 * takes exactly the config of type w.type.
 */
export function WidgetBody({ widget }: { widget: WidgetConfig }) {
  const Body = WIDGETS[widget.type].Body as ComponentType<{ widget: WidgetConfig }>;
  return <Body widget={widget} />;
}
