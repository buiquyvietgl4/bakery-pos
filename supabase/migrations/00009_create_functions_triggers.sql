-- 00009_create_functions_triggers.sql
-- Các hàm xử lý nghiệp vụ tự động, Trigger tính giá cost, Dòng tiền & Chốt sổ

-- 1. Hàm helper lấy role của user từ Supabase Auth JWT
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()),
    'anonymous'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Hàm tự động tính lại giá vốn Recipe khi giá nguyên liệu thay đổi
CREATE OR REPLACE FUNCTION recalculate_recipe_costs(p_ingredient_id UUID DEFAULT NULL)
RETURNS void AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT ri.recipe_id
        FROM recipe_items ri
        WHERE (p_ingredient_id IS NULL OR ri.ingredient_id = p_ingredient_id)
    LOOP
        -- Cập nhật line_cost cho từng dòng nguyên liệu (tính cả hao hụt)
        UPDATE recipe_items ri
        SET line_cost = ri.quantity
                        * (1 + COALESCE(i.wastage_pct, 0) / 100)
                        * i.avg_cost
        FROM ingredients i
        WHERE ri.ingredient_id = i.id
          AND ri.recipe_id = r.recipe_id;

        -- Cập nhật tổng chi phí NVL & giá vốn mỗi đơn vị thành phẩm
        UPDATE recipes rec
        SET total_material_cost = (
                SELECT COALESCE(SUM(ri.line_cost), 0)
                FROM recipe_items ri
                WHERE ri.recipe_id = rec.id
            ),
            cost_per_unit = (
                SELECT COALESCE(SUM(ri.line_cost), 0) / NULLIF(rec.yield_qty, 0)
                FROM recipe_items ri
                WHERE ri.recipe_id = rec.id
            ),
            updated_at = now()
        WHERE rec.id = r.recipe_id;

        -- Cập nhật giá vốn cơ sở lên bảng Sản phẩm (Products)
        UPDATE products p
        SET base_cost_price = rec.cost_per_unit,
            updated_at = now()
        FROM recipes rec
        WHERE p.recipe_id = rec.id
          AND rec.id = r.recipe_id;

        -- Cập nhật giá vốn biến thể (Variants) theo hệ số size
        UPDATE product_variants pv
        SET cost_price = p.base_cost_price * pv.size_multiplier
        FROM products p
        WHERE pv.product_id = p.id
          AND p.recipe_id = r.recipe_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Bất kỳ khi nào avg_cost hoặc wastage_pct của ingredient thay đổi -> cascade tính lại ngay
CREATE OR REPLACE FUNCTION trigger_ingredient_cost_changed()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.avg_cost IS DISTINCT FROM NEW.avg_cost
       OR OLD.wastage_pct IS DISTINCT FROM NEW.wastage_pct THEN
        PERFORM recalculate_recipe_costs(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_ingredient_cost_changed
    AFTER UPDATE ON ingredients
    FOR EACH ROW
    EXECUTE FUNCTION trigger_ingredient_cost_changed();

-- 3. Hàm tính Giá nhập bình quân gia quyền (Weighted Average Cost - WAC) khi nhập kho
CREATE OR REPLACE FUNCTION update_ingredient_wac(
    p_ingredient_id UUID,
    p_incoming_qty NUMERIC,
    p_incoming_unit_price NUMERIC
) RETURNS void AS $$
DECLARE
    v_current_qty NUMERIC;
    v_current_avg NUMERIC;
    v_new_avg NUMERIC;
BEGIN
    SELECT stock_qty, avg_cost
    INTO v_current_qty, v_current_avg
    FROM ingredients
    WHERE id = p_ingredient_id
    FOR UPDATE;

    IF (v_current_qty + p_incoming_qty) > 0 THEN
        v_new_avg := (v_current_qty * v_current_avg + p_incoming_qty * p_incoming_unit_price)
                     / (v_current_qty + p_incoming_qty);
    ELSE
        v_new_avg := p_incoming_unit_price;
    END IF;

    UPDATE ingredients
    SET stock_qty = stock_qty + p_incoming_qty,
        avg_cost = ROUND(v_new_avg, 2),
        updated_at = now()
    WHERE id = p_ingredient_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Hàm trừ kho nguyên liệu khi đơn hàng hoàn tất (Completed)
CREATE OR REPLACE FUNCTION deduct_stock_for_order(p_order_id UUID)
RETURNS void AS $$
DECLARE
    item RECORD;
    ri RECORD;
BEGIN
    FOR item IN
        SELECT oi.product_id, oi.variant_id, oi.quantity,
               COALESCE(pv.size_multiplier, 1.0) AS multiplier
        FROM order_items oi
        LEFT JOIN product_variants pv ON pv.id = oi.variant_id
        WHERE oi.order_id = p_order_id
    LOOP
        FOR ri IN
            SELECT rci.ingredient_id, rci.quantity AS recipe_qty,
                   COALESCE(ing.wastage_pct, 0) AS wastage_pct
            FROM products p
            JOIN recipes r ON r.id = p.recipe_id
            JOIN recipe_items rci ON rci.recipe_id = r.id
            JOIN ingredients ing ON ing.id = rci.ingredient_id
            WHERE p.id = item.product_id
        LOOP
            UPDATE ingredients
            SET stock_qty = stock_qty - (
                    ri.recipe_qty * item.multiplier * item.quantity
                    * (1 + ri.wastage_pct / 100)
                ),
                updated_at = now()
            WHERE id = ri.ingredient_id;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger tự động ghi Sổ quỹ thu tiền + Trừ kho khi đơn hoàn tất
CREATE OR REPLACE FUNCTION trigger_order_cashflow()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Ghi sổ quỹ thu tiền bán hàng
        INSERT INTO cashflow_transactions (
            txn_type, category, amount, description,
            reference_id, reference_type,
            transaction_date, period_month, created_by
        ) VALUES (
            'income', 'sales', NEW.total_amount,
            'Bán hàng đơn ' || COALESCE(NEW.order_number, NEW.local_id),
            NEW.id, 'order',
            CURRENT_DATE,
            TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
            NEW.created_by
        );

        -- Tự động trừ kho nguyên liệu
        PERFORM deduct_stock_for_order(NEW.id);

        -- Cộng tiền mặt kỳ vọng cho ca bán
        IF NEW.shift_id IS NOT NULL THEN
            UPDATE shifts
            SET expected_cash = expected_cash + (
                    SELECT COALESCE(SUM(amount), 0)
                    FROM payments
                    WHERE order_id = NEW.id AND method = 'cash'
                )
            WHERE id = NEW.shift_id AND status = 'open';
        END IF;
    END IF;

    -- Xử lý hủy đơn sau khi đã hoàn tất: tạo bút toán đảo điều chỉnh
    IF NEW.status = 'cancelled' AND OLD.status = 'completed' THEN
        INSERT INTO cashflow_transactions (
            txn_type, category, amount, description,
            reference_id, reference_type,
            transaction_date, period_month, created_by
        ) VALUES (
            'expense', 'adjustment', NEW.total_amount,
            'Hoàn tiền hủy đơn ' || COALESCE(NEW.order_number, NEW.local_id),
            NEW.id, 'adjustment',
            CURRENT_DATE,
            TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
            NEW.created_by
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_order_completed
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_order_cashflow();

-- 6. Trigger tự động ghi chi phí nhập kho & cập nhật tồn kho khi Nhận hàng PO
CREATE OR REPLACE FUNCTION trigger_po_received_cashflow()
RETURNS TRIGGER AS $$
DECLARE
    poi RECORD;
BEGIN
    IF NEW.status = 'received' AND OLD.status != 'received' THEN
        INSERT INTO cashflow_transactions (
            txn_type, category, amount, description,
            reference_id, reference_type,
            transaction_date, period_month, created_by
        ) VALUES (
            'expense', 'ingredient_purchase', NEW.total_amount,
            'Nhập kho phiếu ' || NEW.po_number || ' - ' || COALESCE(NEW.supplier_name,''),
            NEW.id, 'purchase_order',
            CURRENT_DATE,
            TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
            NEW.created_by
        );

        FOR poi IN SELECT * FROM purchase_order_items WHERE po_id = NEW.id LOOP
            PERFORM update_ingredient_wac(poi.ingredient_id, poi.quantity, poi.unit_price);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_po_received
    AFTER UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_po_received_cashflow();

-- 7. Trigger tự động ghi Sổ quỹ chi phí vận hành (OPEX)
CREATE OR REPLACE FUNCTION trigger_opex_cashflow()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO cashflow_transactions (
        txn_type, category, amount, description,
        reference_id, reference_type,
        transaction_date, period_month, created_by
    ) VALUES (
        'expense', 'opex', NEW.amount,
        (SELECT name FROM expense_categories WHERE id = NEW.category_id)
            || ': ' || COALESCE(NEW.description, ''),
        NEW.id, 'operating_expense',
        NEW.expense_date,
        NEW.period_month,
        NEW.created_by
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_opex_created
    AFTER INSERT ON operating_expenses
    FOR EACH ROW
    EXECUTE FUNCTION trigger_opex_cashflow();

-- 8. Hàm Chốt sổ kế toán tháng (Close Month RPC)
CREATE OR REPLACE FUNCTION close_monthly_accounting(p_month TEXT, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_summary_id UUID;
    v_revenue NUMERIC;
    v_cogs NUMERIC;
    v_opex NUMERIC;
    v_order_count INTEGER;
    v_item_count INTEGER;
    v_rev_by_cat JSONB;
    v_cogs_by_cat JSONB;
    v_opex_by_cat JSONB;
    v_daily_rev JSONB;
BEGIN
    IF EXISTS (SELECT 1 FROM monthly_accounting_summary
               WHERE period_month = p_month AND status = 'closed') THEN
        RAISE EXCEPTION 'Kỳ kế toán tháng % đã được chốt sổ trước đó', p_month;
    END IF;

    -- Tổng doanh thu và số lượng đơn
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*), COALESCE(SUM(
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id)
        ), 0)
    INTO v_revenue, v_order_count, v_item_count
    FROM orders o
    WHERE TO_CHAR(o.created_at, 'YYYY-MM') = p_month
      AND o.status = 'completed';

    -- Tổng COGS
    SELECT COALESCE(SUM(total_cogs), 0)
    INTO v_cogs
    FROM orders
    WHERE TO_CHAR(created_at, 'YYYY-MM') = p_month
      AND status = 'completed';

    -- Tổng OPEX
    SELECT COALESCE(SUM(amount), 0)
    INTO v_opex
    FROM operating_expenses
    WHERE period_month = p_month;

    -- Doanh thu theo category bánh
    SELECT COALESCE(jsonb_object_agg(category, cat_total), '{}')
    INTO v_rev_by_cat
    FROM (
        SELECT p.category, SUM(oi.line_total) as cat_total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE TO_CHAR(o.created_at, 'YYYY-MM') = p_month AND o.status = 'completed'
        GROUP BY p.category
    ) sub;

    -- Giá vốn theo category bánh
    SELECT COALESCE(jsonb_object_agg(category, cat_cogs), '{}')
    INTO v_cogs_by_cat
    FROM (
        SELECT p.category, SUM(oi.line_cost) as cat_cogs
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE TO_CHAR(o.created_at, 'YYYY-MM') = p_month AND o.status = 'completed'
        GROUP BY p.category
    ) sub;

    -- OPEX theo khoản mục
    SELECT COALESCE(jsonb_object_agg(cat_name, cat_total), '{}')
    INTO v_opex_by_cat
    FROM (
        SELECT ec.name as cat_name, SUM(oe.amount) as cat_total
        FROM operating_expenses oe
        JOIN expense_categories ec ON ec.id = oe.category_id
        WHERE oe.period_month = p_month
        GROUP BY ec.name
    ) sub;

    -- Doanh thu từng ngày (lưu array 30 ngày để vẫn vẽ được chart sau khi xóa data đơn cũ)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day, 'amount', daily_total)
                    ORDER BY day), '[]')
    INTO v_daily_rev
    FROM (
        SELECT DATE(created_at) as day, SUM(total_amount) as daily_total
        FROM orders
        WHERE TO_CHAR(created_at, 'YYYY-MM') = p_month AND status = 'completed'
        GROUP BY DATE(created_at)
    ) sub;

    -- Lưu tổng hợp vào monthly_accounting_summary
    INSERT INTO monthly_accounting_summary (
        period_month, total_revenue, total_cogs, total_opex,
        total_orders, total_items_sold,
        revenue_by_category, cogs_by_category, opex_by_category, daily_revenue,
        status, closed_at, closed_by
    ) VALUES (
        p_month, v_revenue, v_cogs, v_opex,
        v_order_count, v_item_count,
        v_rev_by_cat, v_cogs_by_cat, v_opex_by_cat, v_daily_rev,
        'closed', now(), p_user_id
    )
    ON CONFLICT (period_month) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_cogs = EXCLUDED.total_cogs,
        total_opex = EXCLUDED.total_opex,
        total_orders = EXCLUDED.total_orders,
        total_items_sold = EXCLUDED.total_items_sold,
        revenue_by_category = EXCLUDED.revenue_by_category,
        cogs_by_category = EXCLUDED.cogs_by_category,
        opex_by_category = EXCLUDED.opex_by_category,
        daily_revenue = EXCLUDED.daily_revenue,
        status = 'closed',
        closed_at = now(),
        closed_by = p_user_id
    RETURNING id INTO v_summary_id;

    -- Khóa tất cả giao dịch trong sổ quỹ của tháng này
    UPDATE cashflow_transactions
    SET is_locked = true
    WHERE period_month = p_month;

    RETURN v_summary_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Hàm ngăn chặn xóa trực tiếp dữ liệu kế toán
CREATE OR REPLACE FUNCTION prevent_accounting_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Nguyên tắc bất biến kế toán: Không thể xóa trực tiếp giao dịch. Hãy tạo bút toán điều chỉnh.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_no_delete_cashflow
    BEFORE DELETE ON cashflow_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_accounting_delete();

CREATE OR REPLACE TRIGGER trg_no_delete_accounting_summary
    BEFORE DELETE ON monthly_accounting_summary
    FOR EACH ROW EXECUTE FUNCTION prevent_accounting_delete();

-- 10. Hàm Purge dọn dẹp data đơn chi tiết để giữ DB dưới 500 MB (Chỉ chạy sau khi đã chốt sổ)
CREATE OR REPLACE FUNCTION purge_monthly_data(p_month TEXT, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_deleted_orders INTEGER;
    v_summary_status TEXT;
BEGIN
    -- Kiểm tra tháng đã chốt sổ chưa
    SELECT status INTO v_summary_status
    FROM monthly_accounting_summary
    WHERE period_month = p_month;

    IF v_summary_status IS NULL OR v_summary_status != 'closed' THEN
        RAISE EXCEPTION 'Chỉ được dọn dẹp dữ liệu chi tiết của tháng ĐÃ CHỐT SỔ';
    END IF;

    -- Xóa các đơn hàng chi tiết (orders cascade xóa order_items, payments)
    WITH deleted AS (
        DELETE FROM orders
        WHERE TO_CHAR(created_at, 'YYYY-MM') = p_month
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_orders FROM deleted;

    -- Cập nhật trạng thái tháng thành 'archived'
    UPDATE monthly_accounting_summary
    SET status = 'archived'
    WHERE period_month = p_month;

    -- Ghi nhật ký audit
    INSERT INTO audit_logs (table_name, record_id, action, old_value, new_value, changed_by)
    VALUES (
        'orders',
        gen_random_uuid(),
        'PURGE',
        jsonb_build_object('period_month', p_month, 'orders_count', v_deleted_orders),
        jsonb_build_object('status', 'archived'),
        p_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'period_month', p_month,
        'deleted_orders', v_deleted_orders
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
