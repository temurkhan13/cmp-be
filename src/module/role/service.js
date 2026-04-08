const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");

const createRole = async (body) => {
	const { data, error } = await supabase.from("roles").insert({
		role_name: body.roleName,
	}).select().single();
	if (error) throw error;

	if (body.rolePrivileges && Array.isArray(body.rolePrivileges)) {
		const privs = body.rolePrivileges.map((p) => ({
			role_id: data.id,
			privilege: p,
		}));
		const { error: privError } = await supabase.from("role_privileges").insert(privs);
		if (privError) throw privError;
	}

	return data;
};

const queryRoles = async (filter, options) => {
	return paginate("roles", { filter, ...options }, supabase);
};

const getRoleById = async (id) => {
	const { data, error } = await supabase.from("roles").select().eq("id", id).single();
	if (error) return null;
	return data;
};

const getRoleByName = async (name) => {
	const { data, error } = await supabase.from("roles").select().eq("role_name", name).single();
	if (error) return null;
	return data;
};

const updateRoleById = async (id, updateBody) => {
	const role = await getRoleById(id);
	if (!role) {
		throw new ApiError(httpStatus.NOT_FOUND, "Role not found");
	}
	const update = {};
	if (updateBody.roleName !== undefined) update.role_name = updateBody.roleName;
	const { data, error } = await supabase.from("roles").update(update).eq("id", id).select().single();
	if (error) throw error;
	return data;
};

const deleteRoleById = async (id) => {
	const role = await getRoleById(id);
	if (!role) {
		throw new ApiError(httpStatus.NOT_FOUND, "Role not found");
	}
	const { error } = await supabase.from("roles").delete().eq("id", id);
	if (error) throw error;
	return role;
};

module.exports = {
	createRole,
	queryRoles,
	getRoleById,
	getRoleByName,
	updateRoleById,
	deleteRoleById,
};
