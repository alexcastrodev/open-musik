class JobPolicy < ApplicationPolicy
  def index? = user&.admin?
end
