// PayNow (SGQR/EMV Merchant Presented) payload builder + CRC16-CCITT
// Based on common PayNow SGQR template structure.

function tlv(id: string, value: string) {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16ccitt(str: string) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPayNowPayload(opts: {
  uen: string;
  amount: number; // 2dp
  ref?: string;
  editable?: boolean; // default false
  expiry?: string; // optional (YYYYMMDD or YYYYMMDDHHmmss)
  merchantName?: string; // optional
  merchantCity?: string; // optional
}) {
  const amountStr = opts.amount.toFixed(2);
  const editable = (opts.editable ?? false) ? "1" : "0";

  // Merchant Account Info (26)
  const maiParts: string[] = [
    tlv("00", "SG.PAYNOW"),
    tlv("01", "2"), // 2 = UEN :contentReference[oaicite:2]{index=2}
    tlv("02", opts.uen),
    tlv("03", editable),
  ];

  if (opts.expiry) maiParts.push(tlv("04", opts.expiry));

  const merchantAccountInfo = maiParts.join("");

  // Additional data (62) - Bill/Ref number (01)
  const addlData = opts.ref ? tlv("62", tlv("01", opts.ref)) : "";

  const payload =
    tlv("00", "01") + // Payload Format Indicator
    tlv("01", "12") + // 12 = dynamic
    tlv("26", merchantAccountInfo) +
    tlv("52", "0000") + // MCC (not used)
    tlv("53", "702") + // SGD :contentReference[oaicite:3]{index=3}
    tlv("54", amountStr) +
    tlv("58", "SG") +
    tlv("59", (opts.merchantName ?? "MERCHANT").slice(0, 25)) +
    tlv("60", (opts.merchantCity ?? "Singapore").slice(0, 15)) +
    addlData;

  // Append CRC (63)
  const toCrc = payload + "6304";
  const crc = crc16ccitt(toCrc);
  return toCrc + crc;
}
