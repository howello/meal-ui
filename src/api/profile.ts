import { getToken } from "@/utils/auth";
import { BASE_API } from "@/utils/env";
import { requestVoid } from "@/utils/request";

/** 本人资料可编辑字段 */
export interface ProfileBody {
  nickName: string;
  email?: string;
  phonenumber?: string;
  /** 性别（0 男 / 1 女 / 2 未知） */
  sex?: string;
}

/**
 * 修改本人资料
 *
 * 复用后端既有 `/system/user/profile`：只改昵称、邮箱、手机号与性别，手机号与邮箱不可重复。
 */
export function updateProfile(data: ProfileBody) {
  return requestVoid({ url: "/system/user/profile", method: "PUT", data });
}

/**
 * 上传本人头像，返回后端给出的可访问地址
 *
 * 后端会先压缩图片再转存到对象存储（R2），并把图床链接写入用户头像；前端直接使用返回的链接。
 * 文件字段名固定为 `avatarfile`，与后端接口一致。
 */
export function uploadAvatar(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    uni.uploadFile({
      url: `${BASE_API}/system/user/profile/avatar`,
      filePath,
      name: "avatarfile",
      header: {
        Authorization: `Bearer ${getToken()}`,
      },
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (body.code === 200) {
            resolve(body.imgUrl || "");
          } else {
            uni.showToast({ title: body.msg || "上传失败", icon: "none" });
            reject(new Error(body.msg || "上传失败"));
          }
        } catch (e) {
          reject(new Error("上传响应解析失败"));
        }
      },
      fail: () => {
        uni.showToast({ title: "上传失败", icon: "none" });
        reject(new Error("上传失败"));
      },
    });
  });
}
