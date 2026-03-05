import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import { loadPdf, savePdf, toolResult, toolError, errMsg } from '../utils.js';

export function registerFormTools(server: McpServer) {
  server.tool(
    'pdf_form_read',
    'Read all form fields from a PDF. Returns each field\'s name, type (Text, CheckBox, Dropdown, OptionList, RadioGroup), current value, and available options. Use this before pdf_form_fill to discover field names.',
    {
      filePath: z.string().describe('Path to the PDF file with form fields'),
      password: z.string().optional().describe('Password if the PDF is encrypted'),
    },
    async ({ filePath, password }) => {
      try {
        const doc = await loadPdf(filePath, password);
        const form = doc.getForm();
        const fields = form.getFields();

        if (fields.length === 0) {
          return toolResult('No form fields found in this PDF.');
        }

        const fieldInfo = fields.map((field) => {
          const name = field.getName();
          let type = 'Unknown';
          let value: string = '';
          let options: string[] | undefined;

          if (field instanceof PDFTextField) {
            type = 'Text';
            value = field.getText() || '';
          } else if (field instanceof PDFCheckBox) {
            type = 'CheckBox';
            value = field.isChecked() ? 'checked' : 'unchecked';
          } else if (field instanceof PDFDropdown) {
            type = 'Dropdown';
            value = field.getSelected().join(', ');
            options = field.getOptions();
          } else if (field instanceof PDFOptionList) {
            type = 'OptionList';
            value = field.getSelected().join(', ');
            options = field.getOptions();
          } else if (field instanceof PDFRadioGroup) {
            type = 'RadioGroup';
            value = field.getSelected() || '';
            options = field.getOptions();
          }

          let line = `  - ${name} (${type}): "${value}"`;
          if (options && options.length > 0) {
            line += `\n    Options: [${options.join(', ')}]`;
          }
          return line;
        });

        return toolResult(
          `Form fields (${fields.length}):\n${fieldInfo.join('\n')}`
        );
      } catch (error: unknown) {
        return toolError(`Failed to read form fields: ${errMsg(error)}`);
      }
    }
  );

  server.tool(
    'pdf_form_fill',
    'Fill form fields in a PDF by name. Supports text fields, checkboxes ("true"/"false"), dropdowns, option lists, and radio groups. Use pdf_form_read first to discover field names and types. Optionally flatten the form to make it non-editable.',
    {
      filePath: z.string().describe('Path to the PDF file with form fields'),
      outputPath: z.string().describe('Path where the filled PDF will be saved'),
      fields: z.record(z.string(), z.string()).describe('Object mapping field names to values. For checkboxes: "true" or "false". For dropdowns/radio: the option value string.'),
      flatten: z.boolean().optional().default(false).describe('If true, flattens the form making fields non-editable (default: false)'),
      password: z.string().optional().describe('Password if the PDF is encrypted'),
    },
    async ({ filePath, outputPath, fields, flatten, password }) => {
      try {
        const doc = await loadPdf(filePath, password);
        const form = doc.getForm();
        let filledCount = 0;
        const errors: string[] = [];

        for (const [name, value] of Object.entries(fields)) {
          try {
            const field = form.getField(name);

            if (field instanceof PDFTextField) {
              field.setText(value);
            } else if (field instanceof PDFCheckBox) {
              if (value === 'true' || value === 'yes' || value === '1') {
                field.check();
              } else {
                field.uncheck();
              }
            } else if (field instanceof PDFDropdown) {
              field.select(value);
            } else if (field instanceof PDFOptionList) {
              field.select(value);
            } else if (field instanceof PDFRadioGroup) {
              field.select(value);
            } else {
              errors.push(`${name}: unsupported field type`);
              continue;
            }
            filledCount++;
          } catch (e: unknown) {
            errors.push(`${name}: ${errMsg(e)}`);
          }
        }

        if (flatten) {
          form.flatten();
        }

        const result = await savePdf(doc, outputPath);
        let msg = `Filled ${filledCount}/${Object.keys(fields).length} field(s): ${result.path}`;
        if (flatten) msg += '\n(Form flattened - fields are now non-editable)';
        if (errors.length > 0) msg += `\nWarnings:\n  ${errors.join('\n  ')}`;

        return toolResult(msg);
      } catch (error: unknown) {
        return toolError(`Failed to fill form: ${errMsg(error)}`);
      }
    }
  );
}
