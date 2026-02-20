/**
 * Unit tests for code metadata extraction (class names, properties, referenced types).
 */
import { extractCodeMetadata, isCodeFileForMetadata } from './code-metadata';

describe('code-metadata', () => {
  describe('isCodeFileForMetadata', () => {
    it('returns true for .cs, .ts, .js, .java', () => {
      expect(isCodeFileForMetadata('Foo.cs')).toBe(true);
      expect(isCodeFileForMetadata('bar.ts')).toBe(true);
      expect(isCodeFileForMetadata('index.js')).toBe(true);
      expect(isCodeFileForMetadata('Service.java')).toBe(true);
      expect(isCodeFileForMetadata('file.tsx')).toBe(true);
    });

    it('returns false for .md, .txt, .json', () => {
      expect(isCodeFileForMetadata('readme.md')).toBe(false);
      expect(isCodeFileForMetadata('notes.txt')).toBe(false);
      expect(isCodeFileForMetadata('config.json')).toBe(false);
    });
  });

  describe('extractCodeMetadata', () => {
    it('returns null for unsupported extension', () => {
      expect(extractCodeMetadata('content', 'file.md')).toBeNull();
      expect(extractCodeMetadata('content', 'file.txt')).toBeNull();
    });

    it('extracts C# class and properties', () => {
      const content = `
        namespace Accounting {
          public class Invoice {
            public decimal Amount { get; set; }
            public Customer Customer { get; set; }
            public List<LineItem> LineItems { get; }
          }
        }
      `;
      const meta = extractCodeMetadata(content, 'Invoice.cs');
      expect(meta).not.toBeNull();
      expect(meta!.file_name).toBe('Invoice.cs');
      expect(meta!.class_names).toContain('Invoice');
      expect(meta!.property_names).toContain('Amount');
      expect(meta!.property_names).toContain('Customer');
      expect(meta!.property_names).toContain('LineItems');
      expect(meta!.referenced_types).toContain('Customer');
      expect(meta!.referenced_types).toContain('LineItem');
    });

    it('extracts TypeScript class and fields', () => {
      const content = `
        export class OrderService {
          private orderRepository: OrderRepository;
          private config: AppConfig;
        }
      `;
      const meta = extractCodeMetadata(content, 'OrderService.ts');
      expect(meta).not.toBeNull();
      expect(meta!.file_name).toBe('OrderService.ts');
      expect(meta!.class_names).toContain('OrderService');
      expect(meta!.property_names).toContain('orderRepository');
      expect(meta!.property_names).toContain('config');
      expect(meta!.referenced_types).toContain('OrderRepository');
      expect(meta!.referenced_types).toContain('AppConfig');
    });

    it('extracts Java class and fields', () => {
      const content = `
        public class WarehouseReceipt {
          private Long id;
          private String number;
          private List<WarehouseItem> items;
          public Long getId() { return id; }
        }
      `;
      const meta = extractCodeMetadata(content, 'WarehouseReceipt.java');
      expect(meta).not.toBeNull();
      expect(meta!.class_names).toContain('WarehouseReceipt');
      expect(meta!.property_names).toContain('id');
      expect(meta!.property_names).toContain('number');
      expect(meta!.property_names).toContain('items');
      expect(meta!.referenced_types).toContain('WarehouseItem');
    });

    it('returns file_name and empty arrays when no classes found', () => {
      const meta = extractCodeMetadata('const x = 1;', 'util.js');
      expect(meta).not.toBeNull();
      expect(meta!.file_name).toBe('util.js');
      expect(meta!.class_names).toEqual([]);
      expect(meta!.property_names).toEqual([]);
      expect(meta!.referenced_types).toEqual([]);
    });
  });
});
