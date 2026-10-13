<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, reactive, ref } from "vue";
import {
  addFamilyMember,
  changeFamilyMemberStatus,
  listFamilyMembers,
  listFamilyRoles,
  removeFamilyMember,
  updateFamilyMember,
} from "@/api/member";
import AppDialog from "@/components/AppDialog.vue";
import GlassButton from "@/components/GlassButton.vue";
import GlassCard from "@/components/GlassCard.vue";
import GlassNavBar from "@/components/GlassNavBar.vue";
import { confirm } from "@/composables/useDialog";
import { useUserStore } from "@/store/user";
import type { FamilyMember, FamilyRole } from "@/types";
import { useOrderNotifierLifecycle } from "@/utils/notify";

const userStore = useUserStore();
useOrderNotifierLifecycle();

const members = ref<FamilyMember[]>([]);
const roles = ref<FamilyRole[]>([]);
const loading = ref(false);
/** 正在编辑的成员ID；为 null 表示表单处于「新增」态 */
const editingId = ref<number | null>(null);
const showForm = ref(false);
const submitting = ref(false);

const form = reactive({
  userName: "",
  nickName: "",
  password: "",
  phonenumber: "",
  roleIds: [] as number[],
});

/** 家庭代码：就是本家庭的部门ID，把它发给要加入的家人 */
const familyCode = computed(() => userStore.user?.deptId ?? userStore.user?.dept?.deptId ?? null);

const isManager = computed(() => userStore.isManager);
/** 当前登录用户ID：自己的那一行不显示「停用/移除」（后端也会拒绝） */
const myUserId = computed(() => userStore.user?.userId);
const formTitle = computed(() => (editingId.value === null ? "新增成员" : "编辑成员"));

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  if (!isManager.value) {
    return;
  }
  await loadAll();
});

async function loadAll() {
  loading.value = true;
  try {
    const [memberList, roleList] = await Promise.all([listFamilyMembers(), listFamilyRoles()]);
    members.value = memberList;
    roles.value = roleList;
  } catch (e) {
    // 加载失败已由请求层提示
  } finally {
    loading.value = false;
  }
}

function roleNames(member: FamilyMember): string[] {
  return (member.roles || []).map((role) => role.roleName);
}

function isDisabled(member: FamilyMember): boolean {
  return member.status === "1";
}

function startAdd() {
  editingId.value = null;
  form.userName = "";
  form.nickName = "";
  form.password = "";
  form.phonenumber = "";
  form.roleIds = defaultEaterRoleIds();
  showForm.value = true;
}

function startEdit(member: FamilyMember) {
  editingId.value = member.userId;
  form.userName = member.userName;
  form.nickName = member.nickName;
  form.password = "";
  form.phonenumber = member.phonenumber || "";
  form.roleIds = (member.roles || []).map((role) => role.roleId);
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
}

/** 默认勾选点餐员，避免新增时一个角色都没选 */
function defaultEaterRoleIds(): number[] {
  const eater = roles.value.find((role) => role.roleKey === "meal_eater");
  return eater ? [eater.roleId] : [];
}

function toggleRole(roleId: number) {
  const idx = form.roleIds.indexOf(roleId);
  if (idx >= 0) {
    form.roleIds.splice(idx, 1);
  } else {
    form.roleIds.push(roleId);
  }
}

function isRoleSelected(roleId: number): boolean {
  return form.roleIds.includes(roleId);
}

async function submitForm() {
  if (!form.nickName.trim()) {
    uni.showToast({ title: "请填写昵称", icon: "none" });
    return;
  }
  if (editingId.value === null) {
    if (!form.userName.trim()) {
      uni.showToast({ title: "请填写账号", icon: "none" });
      return;
    }
    if (!form.password) {
      uni.showToast({ title: "请填写初始密码", icon: "none" });
      return;
    }
  }
  if (form.roleIds.length === 0) {
    uni.showToast({ title: "请至少选择一个角色", icon: "none" });
    return;
  }
  if (submitting.value) {
    return;
  }

  submitting.value = true;
  try {
    if (editingId.value === null) {
      await addFamilyMember({
        userName: form.userName.trim(),
        nickName: form.nickName.trim(),
        password: form.password,
        phonenumber: form.phonenumber.trim() || undefined,
        roleIds: form.roleIds,
      });
      uni.showToast({ title: "已新增成员", icon: "none" });
    } else {
      await updateFamilyMember({
        userId: editingId.value,
        nickName: form.nickName.trim(),
        phonenumber: form.phonenumber.trim() || undefined,
        roleIds: form.roleIds,
      });
      uni.showToast({ title: "已保存", icon: "none" });
    }
    cancelForm();
    await loadAll();
  } catch (e) {
    // 失败原因已由请求层提示
  } finally {
    submitting.value = false;
  }
}

async function toggleStatus(member: FamilyMember) {
  const nextStatus = isDisabled(member) ? "0" : "1";
  const action = nextStatus === "1" ? "停用" : "启用";
  const ok = await confirm(`确定要${action}成员「${member.nickName}」吗？`, action);
  if (!ok) {
    return;
  }
  try {
    await changeFamilyMemberStatus(member.userId, nextStatus);
    uni.showToast({ title: `已${action}`, icon: "none" });
    await loadAll();
  } catch (e) {
    // 失败原因已由请求层提示
  }
}

async function doRemove(member: FamilyMember) {
  const ok = await confirm(`确定要移除成员「${member.nickName}」吗？移除后该账号不能登录`, "移除成员");
  if (!ok) {
    return;
  }
  try {
    await removeFamilyMember(member.userId);
    uni.showToast({ title: "已移除", icon: "none" });
    await loadAll();
  } catch (e) {
    // 失败原因已由请求层提示
  }
}

function copyFamilyCode() {
  if (familyCode.value === null) {
    return;
  }
  uni.setClipboardData({
    data: String(familyCode.value),
    success: () => uni.showToast({ title: "家庭代码已复制", icon: "none" }),
  });
}
</script>

<template>
  <view class="page-body" :class="themeRootClass">
    <GlassNavBar title="家庭与成员" />

    <template v-if="!isManager">
      <GlassCard>
        <text class="empty">只有家庭管理员可以管理家庭成员</text>
      </GlassCard>
    </template>

    <template v-else>
      <GlassCard class="code-card">
        <view class="code-card__head">
          <text class="code-card__label">家庭代码</text>
          <text class="code-card__value" @click="copyFamilyCode">{{ familyCode ?? "—" }}</text>
        </view>
        <text class="tiny">把它发给要加入的家人，对方在登录页点「注册」即可加入本家庭</text>
      </GlassCard>

      <GlassButton class="add-btn" @click="startAdd">新增成员</GlassButton>

      <GlassCard v-if="showForm" class="form">
        <text class="form__title">{{ formTitle }}</text>
        <view v-if="editingId === null" class="field glass">
          <text class="field__label">账号</text>
          <input v-model="form.userName" class="field__input" placeholder="2-20 个字符" placeholder-class="field__ph" />
        </view>
        <view class="field glass">
          <text class="field__label">昵称</text>
          <input v-model="form.nickName" class="field__input" placeholder="家人看到的名字" placeholder-class="field__ph" />
        </view>
        <view v-if="editingId === null" class="field glass">
          <text class="field__label">初始密码</text>
          <input v-model="form.password" class="field__input" password placeholder="5-20 个字符" placeholder-class="field__ph" />
        </view>
        <view class="field glass">
          <text class="field__label">手机号</text>
          <input
            v-model="form.phonenumber"
            class="field__input"
            type="number"
            placeholder="选填"
            placeholder-class="field__ph"
          />
        </view>
        <view class="roles">
          <text class="roles__label">家庭角色</text>
          <view class="roles__list">
            <view
              v-for="role in roles"
              :key="role.roleId"
              class="roles__chip"
              :class="{ 'roles__chip--on': isRoleSelected(role.roleId) }"
              @click="toggleRole(role.roleId)"
            >
              {{ role.roleName }}
            </view>
          </view>
        </view>
        <view class="form__actions">
          <GlassButton variant="ghost" class="form__btn" @click="cancelForm">取消</GlassButton>
          <GlassButton class="form__btn" :disabled="submitting" @click="submitForm">
            {{ submitting ? "保存中…" : "保存" }}
          </GlassButton>
        </view>
      </GlassCard>

      <GlassCard v-if="members.length === 0 && !loading" :pad="false" class="list">
        <text class="empty">还没有其他家庭成员</text>
      </GlassCard>

      <GlassCard v-else :pad="false" class="list">
        <view v-for="member in members" :key="member.userId" class="member">
          <view class="member__main" @click="startEdit(member)">
            <view class="member__row">
              <text class="member__name">{{ member.nickName }}</text>
              <text v-if="isDisabled(member)" class="member__off">已停用</text>
            </view>
            <text class="tiny">{{ member.userName }}</text>
            <view class="member__tags">
              <text v-for="label in roleNames(member)" :key="label" class="tag">{{ label }}</text>
            </view>
          </view>
          <view class="member__ops">
            <template v-if="member.userId !== myUserId">
              <text class="op" @click="toggleStatus(member)">{{ isDisabled(member) ? "启用" : "停用" }}</text>
              <text class="op op--danger" @click="doRemove(member)">移除</text>
            </template>
            <text v-else class="tiny">我</text>
          </view>
        </view>
      </GlassCard>
    </template>

    <AppDialog :class="themeRootClass" />
  </view>
</template>

<style lang="scss" scoped>
.code-card {
  margin-bottom: 24rpx;
}

.code-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.code-card__label {
  font-size: 28rpx;
  color: $lg-ink;
  font-weight: 600;
}

.code-card__value {
  font-size: 40rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
  color: $lg-accent;
}

.add-btn {
  margin-bottom: 24rpx;
}

.form {
  margin-bottom: 24rpx;
}

.form__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: $lg-ink;
  margin-bottom: 20rpx;
}

.field {
  display: flex;
  align-items: center;
  border-radius: 28rpx;
  padding: 24rpx 22rpx;
  margin-bottom: 16rpx;
}

.field__label {
  width: 140rpx;
  font-size: 28rpx;
  color: $lg-ink;
}

.field__input {
  flex: 1;
  font-size: 28rpx;
  color: $lg-ink;
}

.field__ph {
  color: $lg-ink-3;
}

.roles {
  margin: 8rpx 0 20rpx;
}

.roles__label {
  font-size: 28rpx;
  color: $lg-ink;
}

.roles__list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.roles__chip {
  padding: 14rpx 26rpx;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: $lg-ink-2;
  background: $lg-fill-2;
  border: 1px solid $lg-border;
}

.roles__chip--on {
  color: #fff;
  background: linear-gradient(135deg, $lg-accent, $lg-accent-2);
  border-color: transparent;
}

.form__actions {
  display: flex;
  gap: 16rpx;
}

.form__btn {
  flex: 1;
}

.list {
  padding: 8rpx 10rpx;
}

.member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 22rpx;
}

.member + .member {
  border-top: 1px solid $lg-line;
}

.member__main {
  flex: 1;
  min-width: 0;
}

.member__row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.member__name {
  font-size: 30rpx;
  font-weight: 600;
  color: $lg-ink;
}

.member__off {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  color: $meal-danger;
  background: rgba(255, 90, 90, 0.12);
}

.member__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 10rpx;
}

.tag {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  color: $lg-accent;
  background: $lg-accent-soft;
  font-weight: 600;
}

.member__ops {
  display: flex;
  gap: 24rpx;
  padding-left: 16rpx;
}

.op {
  font-size: 26rpx;
  color: $lg-accent;
}

.op--danger {
  color: $meal-danger;
}

.empty {
  display: block;
  padding: 24rpx 22rpx;
  font-size: 26rpx;
  color: $lg-ink-2;
}
</style>
