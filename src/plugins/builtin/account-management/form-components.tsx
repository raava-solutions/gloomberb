import { type ReactNode } from "react";
import { Button, Checkbox, TextField } from "../../../components";
import { Box, Text, TextAttributes } from "../../../ui";
import { colors } from "../../../theme/colors";
import type { AccountFieldKey, ProfileAnalyticsPreview } from "./model";
import { truncate } from "./model";

export function AccountTextField({
  fieldKey,
  label,
  value,
  placeholder,
  activeField,
  focused,
  width,
  type,
  onFocus,
  onChange,
  onSubmit,
}: {
  fieldKey: AccountFieldKey;
  label: string;
  value: string;
  placeholder?: string;
  activeField: AccountFieldKey;
  focused: boolean;
  width: number;
  type?: "text" | "password";
  onFocus: (field: AccountFieldKey) => void;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  const active = activeField === fieldKey;
  const labelWidth = accountFieldLabelWidth(width);
  const inputWidth = Math.max(8, width - labelWidth - 1);
  const labelText = `${active ? "> " : "  "}${label}`;
  return (
    <Box
      height={1}
      width={width}
      flexDirection="row"
      alignItems="center"
      gap={1}
      onMouseDown={() => onFocus(fieldKey)}
    >
      <Text
        width={labelWidth}
        fg={active ? colors.textBright : colors.textDim}
        attributes={active ? TextAttributes.BOLD : 0}
      >
        {truncate(labelText, labelWidth)}
      </Text>
      <TextField
        value={value}
        placeholder={placeholder}
        focused={focused && active}
        width={inputWidth}
        type={type}
        onChange={onChange}
        onSubmit={onSubmit}
        onMouseDown={() => onFocus(fieldKey)}
      />
    </Box>
  );
}

export function accountFieldLabelWidth(width: number) {
  const preferred = width >= 28 ? 16 : Math.max(10, Math.floor(width * 0.42));
  return Math.max(8, Math.min(preferred, width - 9));
}

export function FieldRow({
  twoColumns,
  children,
}: {
  twoColumns: boolean;
  children: ReactNode;
}) {
  return (
    <Box flexDirection={twoColumns ? "row" : "column"} gap={1}>
      {children}
    </Box>
  );
}

export function PickerRow({
  label,
  value,
  detail,
  active,
  width,
  onFocus,
  onOpen,
}: {
  label: string;
  value: string;
  detail?: string;
  active: boolean;
  width: number;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const buttonWidth = Math.max(12, Math.min(32, width - 18));
  const detailWidth = Math.max(0, width - buttonWidth - 4);

  return (
    <Box
      flexDirection="column"
      onMouseOver={onFocus}
      onMouseDown={(event?: { stopPropagation?: () => void; preventDefault?: () => void }) => {
        event?.stopPropagation?.();
        event?.preventDefault?.();
        onFocus();
        onOpen();
      }}
    >
      <Text fg={active ? colors.textBright : colors.textDim} attributes={active ? TextAttributes.BOLD : 0}>
        {active ? `> ${label}` : `  ${label}`}
      </Text>
      <Box height={1} flexDirection="row" gap={1}>
        <Box width={buttonWidth} backgroundColor={active ? colors.selected : colors.panel}>
          <Text fg={active ? colors.selectedText : colors.text}>
            {` ${truncate(value, Math.max(1, buttonWidth - 2))} `}
          </Text>
        </Box>
        {detail ? (
          <Text fg={colors.textMuted}>{truncate(detail, detailWidth)}</Text>
        ) : null}
      </Box>
    </Box>
  );
}

export function CheckboxRow({
  label,
  checked,
  active,
  description,
  width,
  onFocus,
  onChange,
}: {
  label: string;
  checked: boolean;
  active: boolean;
  description?: string;
  width: number;
  onFocus: () => void;
  onChange: (checked: boolean) => void;
}) {
  const labelWidth = accountFieldLabelWidth(width);
  const controlWidth = Math.max(8, width - labelWidth - 1);
  const labelText = `${active ? "> " : "  "}${label}`;
  return (
    <Box
      flexDirection="column"
      width={width}
      onMouseOver={onFocus}
      onMouseDown={(event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        onFocus();
        onChange(!checked);
      }}
    >
      <Box height={1} flexDirection="row" alignItems="center" gap={1}>
        <Text
          width={labelWidth}
          fg={active ? colors.textBright : colors.textDim}
          attributes={active ? TextAttributes.BOLD : 0}
        >
          {truncate(labelText, labelWidth)}
        </Text>
        <Checkbox
          label={label}
          displayLabel={checked ? "On" : "Off"}
          checked={checked}
          active={false}
          width={controlWidth}
          variant="desktop"
          onChange={(nextChecked) => {
            onFocus();
            onChange(nextChecked);
          }}
        />
      </Box>
      {description ? (
        <Box height={1} flexDirection="row" gap={1}>
          <Box width={labelWidth} />
          <Text fg={colors.textMuted} wrapText width={controlWidth}>
            {description}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

function metricColor(tone: ProfileAnalyticsPreview["metrics"][number]["tone"]): string {
  if (tone === "positive") return colors.positive;
  if (tone === "negative") return colors.negative;
  if (tone === "muted") return colors.textMuted;
  return colors.text;
}

export function AccountAnalyticsPreview({
  preview,
  width,
  disclaimer,
  surface = "panel",
}: {
  preview: ProfileAnalyticsPreview;
  width: number;
  disclaimer?: string | null;
  surface?: "panel" | "plain";
}) {
  const horizontalPadding = surface === "panel" ? 1 : 0;
  const contentWidth = Math.max(1, width - horizontalPadding * 2);
  const metricWidth = Math.max(14, Math.min(28, Math.floor((contentWidth - 2) / 2)));
  const subtitleWidth = Math.max(1, contentWidth - preview.title.length - 2);
  const showHeader = surface === "panel";

  return (
    <Box
      flexDirection="column"
      width={width}
      backgroundColor={surface === "panel" ? colors.panel : undefined}
      paddingX={horizontalPadding}
    >
      {showHeader ? (
        <Box height={1} flexDirection="row">
          <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>
            {truncate(preview.title, contentWidth)}
          </Text>
          {preview.subtitle ? (
            <>
              <Box flexGrow={1} />
              <Text fg={colors.textMuted}>{truncate(preview.subtitle, subtitleWidth)}</Text>
            </>
          ) : null}
        </Box>
      ) : null}
      {preview.metrics.length > 0 ? (
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {preview.metrics.map((metric) => {
            const labelWidth = Math.max(1, Math.min(metric.label.length, metricWidth - 2));
            const valueWidth = Math.max(1, metricWidth - labelWidth - 1);
            const detailWidth = Math.max(0, metricWidth - labelWidth - metric.value.length - 2);
            return (
              <Box key={metric.id} width={metricWidth} height={1} flexDirection="row" gap={1}>
                <Text fg={colors.textDim}>{truncate(metric.label, labelWidth)}</Text>
                <Text fg={metricColor(metric.tone)} attributes={TextAttributes.BOLD}>
                  {truncate(metric.value, valueWidth)}
                </Text>
                {metric.detail ? (
                  <Text fg={colors.textMuted}>
                    {truncate(metric.detail, detailWidth)}
                  </Text>
                ) : null}
              </Box>
            );
          })}
        </Box>
      ) : preview.subtitle ? (
        <Text fg={colors.textMuted} wrapText width={contentWidth}>
          {preview.subtitle}
        </Text>
      ) : null}
      {disclaimer ? (
        <Text fg={colors.textMuted} wrapText width={contentWidth}>
          {disclaimer}
        </Text>
      ) : null}
    </Box>
  );
}

export function PublicAnalyticsGroup({
  preview,
  label,
  detail,
  active,
  width,
  disclaimer,
  onFocus,
  onOpen,
}: {
  preview: ProfileAnalyticsPreview;
  label: string;
  detail?: string;
  active: boolean;
  width: number;
  disclaimer?: string | null;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const contentWidth = Math.max(1, width - 2);
  const labelText = active ? "> Public Stats:" : "  Public Stats:";
  const labelWidth = Math.min(accountFieldLabelWidth(width), Math.max(1, contentWidth));
  const buttonWidth = Math.max(14, Math.min(24, Math.floor(contentWidth * 0.3)));
  const selectLabel = `${label} v`;
  const normalizedDetail = (detail ?? "").replace(/\.+$/, "");
  const displayPreview = (
    preview.metrics.length === 0
    && normalizedDetail
    && preview.subtitle.replace(/\.+$/, "") === normalizedDetail
  ) ? { ...preview, subtitle: "" } : preview;
  const metrics = displayPreview.metrics.slice(0, 2);
  const metricAreaWidth = Math.max(0, contentWidth - labelWidth - buttonWidth - 2);
  const metricWidth = metrics.length > 0 ? Math.max(8, Math.floor((metricAreaWidth - (metrics.length - 1)) / metrics.length)) : 0;
  const detailWidth = Math.max(0, metricAreaWidth);
  return (
    <Box
      flexDirection="column"
      width={width}
      onMouseOver={onFocus}
    >
      <Box height={1} flexDirection="row" gap={1}>
        <Text fg={active ? colors.textBright : colors.textDim} attributes={active ? TextAttributes.BOLD : 0}>
          {truncate(labelText, labelWidth)}
        </Text>
        <Button
          label={truncate(selectLabel, Math.max(1, buttonWidth - 2))}
          variant="secondary"
          width={buttonWidth}
          active={active}
          onPress={() => {
            onFocus();
            onOpen();
          }}
        />
        {metrics.length > 0 ? metrics.map((metric) => {
          const labelTextWidth = Math.max(1, Math.min(metric.label.length, metricWidth - 2));
          const valueWidth = Math.max(1, metricWidth - labelTextWidth - 1);
          return (
            <Box key={metric.id} width={metricWidth} height={1} flexDirection="row" gap={1}>
              <Text fg={colors.textDim}>{truncate(metric.label, labelTextWidth)}</Text>
              <Text fg={metricColor(metric.tone)} attributes={TextAttributes.BOLD}>
                {truncate(metric.value, valueWidth)}
              </Text>
            </Box>
          );
        }) : detail ? (
          <Text fg={colors.textMuted}>
            {truncate(detail, detailWidth)}
          </Text>
        ) : null}
      </Box>
      {metrics.length === 0 && displayPreview.subtitle ? (
        <Text fg={colors.textMuted} wrapText width={contentWidth}>
          {displayPreview.subtitle}
        </Text>
      ) : null}
      {disclaimer ? (
        <Text fg={colors.textMuted} wrapText width={contentWidth}>
          {disclaimer}
        </Text>
      ) : null}
    </Box>
  );
}
