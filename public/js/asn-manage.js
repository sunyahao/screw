// ASN管理系统前端脚本

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('receipt_date');
    if (dateInput) {
        dateInput.value = today;
    }
    
    // 添加淡入动画
    document.body.classList.add('fade-in');
});

// 添加商品行
function addItemRow() {
    const container = document.getElementById('itemsContainer');
    const newRow = document.createElement('div');
    newRow.className = 'item-row mb-3';
    newRow.innerHTML = `
        <div class="row">
            <div class="col-md-3">
                <input type="text" class="form-control" name="product_name" placeholder="商品名称 *" required>
            </div>
            <div class="col-md-2">
                <input type="text" class="form-control" name="product_code" placeholder="商品编码">
            </div>
            <div class="col-md-2">
                <input type="text" class="form-control" name="specification" placeholder="规格型号">
            </div>
            <div class="col-md-2">
                <input type="number" class="form-control" name="quantity" placeholder="数量 *" min="1" required onchange="calculateTotal(this)">
            </div>
            <div class="col-md-2">
                <input type="number" class="form-control" name="unit_price" placeholder="单价 *" min="0" step="0.01" required onchange="calculateTotal(this)">
            </div>
            <div class="col-md-1">
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeItemRow(this)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    container.appendChild(newRow);
}

// 删除商品行
function removeItemRow(button) {
    const itemRow = button.closest('.item-row');
    if (document.querySelectorAll('.item-row').length > 1) {
        itemRow.remove();
    } else {
        showAlert('至少需要保留一个商品明细', 'warning');
    }
}

// 计算总价（暂时不实现自动计算，让用户手动管理）
function calculateTotal(input) {
    // 可以在这里添加实时计算总价的逻辑
    // 目前保留为占位函数
}

// 提交创建表单
async function submitCreateForm() {
    const form = document.getElementById('createReceiptForm');
    const formData = new FormData(form);
    
    // 验证表单
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // 收集商品明细
    const items = [];
    const itemRows = document.querySelectorAll('.item-row');
    
    for (let row of itemRows) {
        const productName = row.querySelector('input[name="product_name"]').value;
        const productCode = row.querySelector('input[name="product_code"]').value;
        const specification = row.querySelector('input[name="specification"]').value;
        const quantity = parseInt(row.querySelector('input[name="quantity"]').value);
        const unitPrice = parseFloat(row.querySelector('input[name="unit_price"]').value);
        
        if (!productName || !quantity || !unitPrice) {
            showAlert('请完整填写商品信息（商品名称、数量、单价为必填项）', 'warning');
            return;
        }
        
        items.push({
            product_name: productName,
            product_code: productCode,
            specification: specification,
            quantity: quantity,
            unit_price: unitPrice
        });
    }
    
    if (items.length === 0) {
        showAlert('请至少添加一个商品明细', 'warning');
        return;
    }
    
    // 准备提交数据
    const submitData = {
        supplier_name: formData.get('supplier_name'),
        supplier_contact: formData.get('supplier_contact'),
        receipt_date: formData.get('receipt_date'),
        receipt_type: formData.get('receipt_type'),
        warehouse: formData.get('warehouse'),
        remarks: formData.get('remarks'),
        items: items
    };
    
    // 显示加载状态
    const submitBtn = document.querySelector('button[onclick="submitCreateForm()"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="loading"></span> 创建中...';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch('/api/asn/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(submitData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(`入库单创建成功！ASN单号：${result.asnNumber}`, 'success');
            // 关闭模态框
            const modal = bootstrap.Modal.getInstance(document.getElementById('createReceiptModal'));
            modal.hide();
            // 重新加载页面
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showAlert(`创建失败：${result.message}`, 'danger');
        }
    } catch (error) {
        console.error('创建入库单时发生错误:', error);
        showAlert('创建失败：网络错误，请稍后重试', 'danger');
    } finally {
        // 恢复按钮状态
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// 更新入库单状态
async function updateStatus(receiptId, newStatus) {
    const statusText = {
        'pending': '待处理',
        'processing': '处理中',
        'completed': '已完成',
        'cancelled': '已取消'
    };
    
    const confirmMessage = `确定要将入库单状态更新为"${statusText[newStatus]}"吗？`;
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch('/api/asn/update-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                receiptId: receiptId,
                status: newStatus
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('状态更新成功', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showAlert(`更新失败：${result.message}`, 'danger');
        }
    } catch (error) {
        console.error('更新状态时发生错误:', error);
        showAlert('更新失败：网络错误，请稍后重试', 'danger');
    }
}

// 删除入库单
async function deleteReceipt(receiptId) {
    if (!confirm('确定要删除这个入库单吗？此操作不可撤销！')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/asn/delete/${receiptId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('删除成功', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showAlert(`删除失败：${result.message}`, 'danger');
        }
    } catch (error) {
        console.error('删除入库单时发生错误:', error);
        showAlert('删除失败：网络错误，请稍后重试', 'danger');
    }
}

// 显示提示信息
function showAlert(message, type = 'info') {
    // 创建提示框
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // 自动关闭
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// 表单重置功能
function resetCreateForm() {
    const form = document.getElementById('createReceiptForm');
    form.reset();
    
    // 重置日期为今天
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('receipt_date').value = today;
    
    // 重置商品明细为一行
    const container = document.getElementById('itemsContainer');
    container.innerHTML = `
        <div class="item-row mb-3">
            <div class="row">
                <div class="col-md-3">
                    <input type="text" class="form-control" name="product_name" placeholder="商品名称 *" required>
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control" name="product_code" placeholder="商品编码">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control" name="specification" placeholder="规格型号">
                </div>
                <div class="col-md-2">
                    <input type="number" class="form-control" name="quantity" placeholder="数量 *" min="1" required onchange="calculateTotal(this)">
                </div>
                <div class="col-md-2">
                    <input type="number" class="form-control" name="unit_price" placeholder="单价 *" min="0" step="0.01" required onchange="calculateTotal(this)">
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeItemRow(this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// 模态框事件监听
document.addEventListener('DOMContentLoaded', function() {
    const createModal = document.getElementById('createReceiptModal');
    if (createModal) {
        createModal.addEventListener('hidden.bs.modal', function() {
            resetCreateForm();
        });
    }
});

// 键盘快捷键
document.addEventListener('keydown', function(e) {
    // Ctrl+N 创建新入库单
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        const createBtn = document.querySelector('button[data-bs-target="#createReceiptModal"]');
        if (createBtn) {
            createBtn.click();
        }
    }
    
    // ESC 关闭模态框
    if (e.key === 'Escape') {
        const modal = document.querySelector('.modal.show');
        if (modal) {
            const modalInstance = bootstrap.Modal.getInstance(modal);
            if (modalInstance) {
                modalInstance.hide();
            }
        }
    }
});