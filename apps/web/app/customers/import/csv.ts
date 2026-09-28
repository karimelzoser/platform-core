export interface CustomerImportRow {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  contactPoints: Array<{
    channel: 'EMAIL' | 'PHONE';
    value: string;
    label: string;
    isPrimary: boolean;
  }>;
}

export type CustomerImportCsvResult = { customers: CustomerImportRow[] } | { error: string };

export function parseCustomerImportCsv(text: string): CustomerImportCsvResult {
  const parsedRows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  if (!parsedRows) return { error: 'CSV contains an unterminated quoted field.' };
  const rows = parsedRows.filter((row) => row.some((cell) => cell.trim()));
  const [header, ...data] = rows;
  if (
    !header ||
    header.join(',').toLowerCase() !== 'display_name,first_name,last_name,company_name,email,phone'
  )
    return {
      error: 'CSV header must be: display_name,first_name,last_name,company_name,email,phone',
    };
  if (!data.length || data.length > 100) return { error: 'CSV must contain one to 100 data rows.' };
  const customers = data.map((row) => {
    const [
      displayName = '',
      firstName = '',
      lastName = '',
      companyName = '',
      email = '',
      phone = '',
    ] = row;
    return {
      ...(displayName ? { displayName } : {}),
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(companyName ? { companyName } : {}),
      contactPoints: [
        email
          ? { channel: 'EMAIL' as const, value: email, label: 'Imported email', isPrimary: true }
          : undefined,
        phone
          ? {
              channel: 'PHONE' as const,
              value: phone,
              label: 'Imported phone',
              isPrimary: !email,
            }
          : undefined,
      ].filter(
        (
          contact,
        ): contact is {
          channel: 'EMAIL' | 'PHONE';
          value: string;
          label: string;
          isPrimary: boolean;
        } => contact !== undefined,
      ),
    };
  });
  if (
    customers.some(
      (customer) =>
        !customer.displayName && !customer.firstName && !customer.lastName && !customer.companyName,
    )
  )
    return { error: 'Every row requires a display name, personal name, or company name.' };
  return { customers };
}

function parseCsvRows(text: string): string[][] | undefined {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quoted) {
      if (character === '"' && text.charAt(index + 1) === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && !cell) quoted = true;
    else if (character === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (character === '\n') {
      row.push(cell.trim().replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) return undefined;
  row.push(cell.trim());
  rows.push(row);
  return rows;
}
