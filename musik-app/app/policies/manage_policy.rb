class ManagePolicy < ApplicationPolicy
  def index? = user&.admin?
end
