import { Injectable } from '@nestjs/common';
import type { TenantRequestContext } from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from './api-database.service.js';

@Injectable()
export class ReturnsOptionsService {
  public constructor(private readonly database: ApiDatabaseService) {}

  public async get(context: TenantRequestContext, returnId: string) {
    return withTenantTransaction(this.database.database, context, async (transaction) => {
      const request = await sql<{ store_id: string; order_id: string }>`
        select store_id, order_id from returns.return_requests where id = ${returnId}::uuid
      `.execute(transaction);
      const row = request.rows[0];
      if (!row) return undefined;
      const [variants, locations, payments] = await Promise.all([
        sql<{
          id: string;
          title: string;
          sku: string | null;
          price_minor: string;
          currency: string;
        }>`select variant.id, product.title || ' · ' || variant.title as title,
                   variant.sku, variant.price_minor::text, variant.currency
            from commerce.variants variant
            join commerce.products product
              on product.tenant_id = variant.tenant_id and product.id = variant.product_id
            where variant.store_id = ${row.store_id}::uuid and variant.status = 'ACTIVE'
              and product.status = 'ACTIVE'
            order by lower(product.title), lower(variant.title), variant.id
            limit 200`.execute(transaction),
        sql<{ id: string; name: string }>`select id, name from commerce.inventory_locations
          where store_id = ${row.store_id}::uuid and status = 'ACTIVE'
          order by lower(name), id limit 100`.execute(transaction),
        sql<{
          id: string;
          kind: string;
          status: string;
          amount_minor: string;
          currency: string;
        }>`select id, kind, status, amount_minor::text, currency from commerce.payments
          where order_id = ${row.order_id}::uuid and status in ('AUTHORIZED','CAPTURED','PARTIALLY_REFUNDED')
          order by processed_at desc nulls last, created_at desc, id`.execute(transaction),
      ]);
      return {
        variants: variants.rows.map((variant) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          priceMinor: variant.price_minor,
          currency: variant.currency,
        })),
        locations: locations.rows,
        payments: payments.rows.map((payment) => ({
          id: payment.id,
          kind: payment.kind,
          status: payment.status,
          amountMinor: payment.amount_minor,
          currency: payment.currency,
        })),
      };
    });
  }
}
